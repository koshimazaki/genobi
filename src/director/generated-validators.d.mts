type Validator = ((value: unknown) => boolean) & {
  errors?: null | { message?: string; instancePath: string }[];
};
declare const validators: Record<string, Validator>;
export default validators;
