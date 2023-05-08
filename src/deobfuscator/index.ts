import { applyTransform, Transform } from '../transforms';
import mergeStrings from '../transforms/mergeStrings';
import { codePreview } from '../utils/ast';
import { findArrayRotator } from './arrayRotator';
import controlFlowObject from './controlFlowObject';
import controlFlowSwitch from './controlFlowSwitch';
import { findDecoders } from './decoder';
import inlineDecodedStrings from './inlineDecodedStrings';
import inlineDecoderWrappers from './inlineDecoderWrappers';
import objectLiterals from './objectLiterals';
import { findStringArray } from './stringArray';
import { VMDecoder } from './vm';

// https://astexplorer.net/#/gist/b1018df4a8daebfcb1daf9d61fe17557/4ff9ad0e9c40b9616956f17f59a2d9888cd62a4f

export default {
  name: 'deobfuscate',
  tags: ['unsafe'],
  run(ast, state) {
    const stringArray = findStringArray(ast);
    console.log(`String Array: ${!!stringArray}`);
    if (!stringArray) return;
    console.log(' - length: ' + stringArray.length);
    console.log(` - ${codePreview(stringArray.path.node)}`);

    const rotator = findArrayRotator(stringArray);
    console.log(`String Array Rotate: ${!!rotator}`);
    if (rotator) {
      console.log(` - ${codePreview(rotator.node)}`);
    }

    const decoders = findDecoders(stringArray);
    console.log(`String Array Encodings: ${decoders.length}`);

    state.changes += applyTransform(ast, objectLiterals).changes;

    for (const decoder of decoders) {
      console.log(` - ${codePreview(decoder.path.node)}`);

      state.changes += applyTransform(
        ast,
        inlineDecoderWrappers,
        decoder.path
      ).changes;
    }

    const vm = new VMDecoder(stringArray, decoders, rotator);
    state.changes += applyTransform(ast, inlineDecodedStrings, { vm }).changes;

    stringArray.path.remove();
    rotator?.remove();
    decoders.forEach(decoder => decoder.path.remove());
    state.changes += 2 + decoders.length;

    state.changes += applyTransform(ast, mergeStrings).changes;
    state.changes += applyTransform(ast, controlFlowObject).changes;
    state.changes += applyTransform(ast, controlFlowSwitch).changes;
  },
} satisfies Transform;
