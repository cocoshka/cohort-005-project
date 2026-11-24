// The body of a function of `stored`, the device's saved choice, and `now`,
// a Date.
export const IS_FESTIVE_BODY = `
  if (stored === "on") return true;
  if (stored === "off") return false;
  var month = now.getMonth();
  var day = now.getDate();
  return month === 11 || (month === 0 && day <= 6);
`;

export const isFestive = new Function("stored", "now", IS_FESTIVE_BODY) as (
  stored: string | null,
  now: Date
) => boolean;
