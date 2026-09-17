import assert from "node:assert/strict";
import { cursorPermission } from "./cursor_service";

assert.equal(cursorPermission("editor"), "write");
assert.equal(cursorPermission("viewer"), "read");
console.log("cursor permission decision passed");
