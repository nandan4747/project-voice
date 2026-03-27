// Accepts an array: [playCount, id] or [timestamp, id]
export const encodeCursor = (values) => {
  return Buffer.from(values.join("|")).toString("base64");
};

// Returns an array of strings: ["11", "21"]
export const decodeCursor = (cursor) => {
  return Buffer.from(cursor, "base64").toString("ascii").split("|");
};
