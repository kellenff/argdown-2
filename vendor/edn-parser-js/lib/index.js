import { parse } from './parser.js';
export const ednParseMulti = (s) => {
    return parse(s);
};
export const ednParse = (edn) => {
    return ednParseMulti(edn)[0];
};
//# sourceMappingURL=index.js.map