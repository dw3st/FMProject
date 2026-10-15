import { expect, test } from "bun:test";
import { closeInDock, isRoomVisible, openInDock, parseDock, pruneDmChats, toggleInDock } from "@/GameInterface/Social/chatDockState";

test("opening a fourth chat minimizes the oldest open one", () => {
  let dock = openInDock([], "dm:a");
  dock = openInDock(dock, "dm:b");
  dock = openInDock(dock, "dm:c");
  dock = openInDock(dock, "dm:d");
  expect(dock).toEqual([
    { room: "dm:a", minimized: true },
    { room: "dm:b", minimized: false },
    { room: "dm:c", minimized: false },
    { room: "dm:d", minimized: false },
  ]);
});

test("reopening a minimized chat brings it to the end, open", () => {
  const dock = toggleInDock([{ room: "dm:a", minimized: true }, { room: "dm:b", minimized: false }], "dm:a");
  expect(dock).toEqual([{ room: "dm:b", minimized: false }, { room: "dm:a", minimized: false }]);
  expect(toggleInDock(dock, "dm:a")).toEqual([{ room: "dm:b", minimized: false }, { room: "dm:a", minimized: true }]);
  expect(closeInDock(dock, "dm:b")).toEqual([{ room: "dm:a", minimized: false }]);
  expect(isRoomVisible(dock, "dm:a")).toBe(true);
  expect(isRoomVisible([{ room: "dm:a", minimized: true }], "dm:a")).toBe(false);
});

test("parseDock keeps only valid entries and the open limit", () => {
  const raw = JSON.stringify([
    { room: "dm:a", minimized: false },
    { room: "lobby", minimized: false },
    { room: "dm:b", minimized: "no" },
    { room: "dm:c", minimized: false },
    { room: "dm:d", minimized: false },
    { room: "world:x", minimized: false },
  ]);
  expect(parseDock(raw)).toEqual([
    { room: "dm:a", minimized: true },
    { room: "dm:c", minimized: false },
    { room: "dm:d", minimized: false },
    { room: "world:x", minimized: false },
  ]);
  expect(parseDock("not json")).toEqual([]);
  expect(parseDock(null)).toEqual([]);
});

test("pruneDmChats closes DMs with someone who is no longer a friend (unfriended or renamed); worlds stay", () => {
  const dock = [
    { room: "dm:Ana", minimized: false },
    { room: "dm:old_name", minimized: true },
    { room: "world:abc", minimized: false },
  ];
  expect(pruneDmChats(dock, ["Ana", "new_name"])).toEqual([
    { room: "dm:Ana", minimized: false },
    { room: "world:abc", minimized: false },
  ]);
  const same = [{ room: "dm:Ana", minimized: false }];
  expect(pruneDmChats(same, ["Ana"])).toBe(same);
});
