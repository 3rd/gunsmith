// single source for which FORCE_COLOR values mean "force color on"
export const isForceColorOn = (value: string | undefined): value is string =>
  value !== undefined && value !== "0" && value !== "false" && value !== "";

export const getShouldUseAnsi = (params: {
  colorFlag: boolean | undefined;
  env: Record<string, string | undefined>;
  isTTY: boolean;
}) => {
  if (params.colorFlag === false) return false;
  if (params.colorFlag === true) return true;
  if (params.env.FORCE_COLOR !== undefined) return isForceColorOn(params.env.FORCE_COLOR);
  // empty NO_COLOR is ignored per the no-color spec
  if (params.env.NO_COLOR !== undefined && params.env.NO_COLOR !== "") return false;
  return params.isTTY;
};

const CODES = {
  bold: 1,
  red: 31,
  green: 32,
  yellow: 33,
  cyan: 36,
  gray: 90,
} as const;

export const makePaint = (shouldUseAnsi: boolean) => {
  return (s: string, ...attributes: (keyof typeof CODES)[]) => {
    if (!shouldUseAnsi || attributes.length === 0) return s;
    const open = attributes.map((attribute) => `\u001b[${CODES[attribute]}m`).join("");
    return `${open}${s}\u001b[0m`;
  };
};
