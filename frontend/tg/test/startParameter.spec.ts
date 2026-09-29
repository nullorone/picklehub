import assert from "node:assert/strict";
import test from "node:test";
import { gameIdFromStartParameter } from "../src/navigation/startParameter.ts";

test("accepts only a game start parameter", () => {
    assert.equal(
        gameIdFromStartParameter("g_11111111-1111-4111-8111-111111111111"),
        "11111111-1111-4111-8111-111111111111",
    );
    assert.equal(gameIdFromStartParameter("g_bad"), null);
    assert.equal(gameIdFromStartParameter("../admin"), null);
});
