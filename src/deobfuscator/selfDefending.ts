import { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import * as m from '@codemod/matchers';
import { Transform } from '../transforms';
import {
  constMemberExpression,
  emptyIife,
  falseMatcher,
  matchIife,
  trueMatcher,
} from '../utils/matcher';

// SingleCallController: https://github.com/javascript-obfuscator/javascript-obfuscator/blob/d7f73935557b2cd15a2f7cd0b01017d9cddbd015/src/custom-code-helpers/common/templates/SingleCallControllerTemplate.ts

// Works for
// self defending: https://github.com/javascript-obfuscator/javascript-obfuscator/blob/d7f73935557b2cd15a2f7cd0b01017d9cddbd015/src/custom-code-helpers/self-defending/templates/SelfDefendingTemplate.ts
// domain lock: https://github.com/javascript-obfuscator/javascript-obfuscator/blob/d7f73935557b2cd15a2f7cd0b01017d9cddbd015/src/custom-code-helpers/domain-lock/templates/DomainLockTemplate.ts
// console output: https://github.com/javascript-obfuscator/javascript-obfuscator/blob/d7f73935557b2cd15a2f7cd0b01017d9cddbd015/src/custom-code-helpers/console-output/templates/ConsoleOutputDisableTemplate.ts
// debug protection function call: https://github.com/javascript-obfuscator/javascript-obfuscator/blob/d7f73935557b2cd15a2f7cd0b01017d9cddbd015/src/custom-code-helpers/debug-protection/templates/debug-protection-function-call/DebugProtectionFunctionCallTemplate.ts

export default {
  name: 'selfDefending',
  tags: ['safe'],
  visitor() {
    const callController = m.capture(m.anyString());
    const firstCall = m.capture(m.identifier());
    const rfn = m.capture(m.identifier());
    const context = m.capture(m.identifier());
    const res = m.capture(m.identifier());
    const fn = m.capture(m.identifier());

    // const callControllerFunctionName = (function() { ... })();
    const matcher = m.variableDeclarator(
      m.identifier(callController),
      matchIife([
        // let firstCall = true;
        m.variableDeclaration(undefined, [
          m.variableDeclarator(firstCall, trueMatcher),
        ]),
        // return function (context, fn) {
        m.returnStatement(
          m.functionExpression(
            null,
            [context, fn],
            m.blockStatement([
              m.variableDeclaration(undefined, [
                // const rfn = firstCall ? function() {
                m.variableDeclarator(
                  rfn,
                  m.conditionalExpression(
                    m.fromCapture(firstCall),
                    m.functionExpression(
                      null,
                      [],
                      m.blockStatement([
                        // if (fn) {
                        m.ifStatement(
                          m.fromCapture(fn),
                          m.blockStatement([
                            // const res = fn.apply(context, arguments);
                            m.variableDeclaration(undefined, [
                              m.variableDeclarator(
                                res,
                                m.callExpression(
                                  constMemberExpression(
                                    m.fromCapture(fn),
                                    'apply'
                                  ),
                                  [
                                    m.fromCapture(context),
                                    m.identifier('arguments'),
                                  ]
                                )
                              ),
                            ]),
                            // fn = null;
                            m.expressionStatement(
                              m.assignmentExpression(
                                '=',
                                m.fromCapture(fn),
                                m.nullLiteral()
                              )
                            ),
                            // return res;
                            m.returnStatement(m.fromCapture(res)),
                          ])
                        ),
                      ])
                    ),
                    // : function() {}
                    m.functionExpression(null, [], m.blockStatement([]))
                  )
                ),
              ]),
              // firstCall = false;
              m.expressionStatement(
                m.assignmentExpression(
                  '=',
                  m.fromCapture(firstCall),
                  falseMatcher
                )
              ),
              // return rfn;
              m.returnStatement(m.fromCapture(rfn)),
            ])
          )
        ),
      ])
    );

    return {
      enter(path) {
        if (!matcher.match(path.node)) return;
        const binding = path.scope.getBinding(callController.current!)!;
        // const callControllerFunctionName = (function() { ... })();
        //       ^ path/binding

        binding.referencePaths
          .filter(ref => ref.parent.type === 'CallExpression')
          .forEach(ref => {
            if (ref.parentPath?.parent.type === 'CallExpression') {
              // callControllerFunctionName(this, function () { ... })();
              // ^ ref
              ref.parentPath.parentPath?.remove();
            } else {
              // const selfDefendingFunctionName = callControllerFunctionName(this, function () {
              // selfDefendingFunctionName();      ^ ref
              removeSelfDefendingRefs(ref as NodePath<t.Identifier>);
            }

            // leftover (function () {})() from debug protection function call
            ref.findParent(p => emptyIife.match(p.node))?.remove();

            this.changes++;
          });

        path.remove();
        this.changes++;
      },
      noScope: true,
    };
  },
} satisfies Transform;

function removeSelfDefendingRefs(path: NodePath<t.Identifier>) {
  const varName = m.capture(m.anyString());
  const varMatcher = m.variableDeclarator(
    m.identifier(varName),
    m.callExpression(m.identifier(path.node.name))
  );
  const callMatcher = m.expressionStatement(
    m.callExpression(m.identifier(m.fromCapture(varName)), [])
  );
  const varDecl = path.findParent(p =>
    varMatcher.match(p.node)
  ) as NodePath<t.VariableDeclarator> | null;

  if (varDecl) {
    const binding = varDecl.scope.getBinding(varName.current!);

    binding?.referencePaths.forEach(ref => {
      if (callMatcher.match(ref.parentPath?.parent))
        ref.parentPath?.parentPath?.remove();
    });
    varDecl.remove();
  }
}
