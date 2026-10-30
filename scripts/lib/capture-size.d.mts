export declare const MAX_BYTES: number;
export declare const CRF_FLOOR: number;
export declare function sizeStep(
  bytes: number,
  crf: number,
  max?: number,
  floor?: number,
): "keep" | "retry" | "fail";
