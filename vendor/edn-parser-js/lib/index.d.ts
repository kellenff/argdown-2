export type EDNSymbol = {
    symbol: string;
    ns?: string;
};
export type EDN = number | null | boolean | string | EDNSymbol | {
    keyword: string;
    ns?: string;
} | {
    char: string;
} | EDN[] | {
    map: [EDN, EDN][];
} | {
    set: EDN[];
} | {
    list: EDN[];
} | {
    tag: EDNSymbol;
    value: EDN;
} | {
    meta: [EDN, EDN][];
    value: EDN;
};
export declare const ednParseMulti: (s: string) => EDN[];
export declare const ednParse: (edn: string) => EDN | undefined;
//# sourceMappingURL=index.d.ts.map