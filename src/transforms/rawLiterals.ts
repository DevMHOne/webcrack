import { Transform } from '.';

export default {
  name: 'rawLiterals',
  tags: ['safe'],
  visitor: () => ({
    StringLiteral(path) {
      if (path.node.extra) {
        path.node.extra.raw = JSON.stringify(path.node.extra.rawValue);
        this.changes++;
      }
    },
    NumericLiteral(path) {
      if (path.node.extra) {
        delete path.node.extra;
        this.changes++;
      }
    },
    noScope: true,
  }),
} satisfies Transform;
