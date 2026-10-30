import { describe, expect, it } from "vitest";
import { databaseError } from "./http";

async function code(error: Parameters<typeof databaseError>[0]) {
  const response = databaseError(error);
  const body = (await response.json()) as { error: { code: string } };
  return [response.status, body.error.code];
}

describe("databaseError", () => {
  it("passes our own 22023 reasons through as the code", async () => {
    expect(await code({ code: "22023", message: "time_out_of_range" })).toEqual(
      [400, "time_out_of_range"],
    );
  });

  it("hides Postgres prose behind invalid_input", async () => {
    expect(
      await code({
        code: "22023",
        message: 'invalid value for parameter "TimeZone": "x"',
      }),
    ).toEqual([400, "invalid_input"]);
    expect(await code({ code: "22023" })).toEqual([400, "invalid_input"]);
  });

  it("maps unknown errors to a 500 without details", async () => {
    expect(await code({ code: "XX000", message: "secret detail" })).toEqual([
      500,
      "internal_error",
    ]);
  });
});
