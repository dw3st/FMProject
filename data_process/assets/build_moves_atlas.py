"""Atlases of the top-down figures with the richer set of moves, in the slim body the user picked (option C,
2026-11-13): player-atlas-4, player-real-atlas-4, keeper-atlas-4.

Only the three atlas sheets are written (no single-frame files): the old atlases stay as they are, because game art
URLs are cached for good and a changed sheet needs a new name. Usage: python build_moves_atlas.py
"""
import people
from common import OUT, save_atlas

# Slim body: every pose keeps its shape, scaled from the old defaults (head 7.4, torso 15.5 x 8.2, limb 1).
HEAD, TORSO_X, TORSO_Y, LIMB = 5.7 / 7.4, 12.2 / 15.5, 6.0 / 8.2, 0.74
REAL_HEAD = 5.2 / 5.7
# Arms: full thickness, shoulders brought in with the torso and the reach shortened; with the old reach on the narrow
# body they read as an inflatable tube man (user, 2026-11-13).
ARM, REACH = 0.92, 0.8


def slim_arms(spec):
    arms = spec.get("arms")
    if arms is None:
        return {}
    cx, _ = spec.get("center", (32.0, 35.0))
    out = []
    for sh, hand in arms:
        s2 = (cx + (sh[0] - cx) * TORSO_X, sh[1])
        out.append((s2, (s2[0] + (hand[0] - sh[0]) * REACH, s2[1] + (hand[1] - sh[1]) * REACH)))
    return {"arms": out}


def slim(specs, head=1.0):
    out = []
    for name, spec in specs:
        tx, ty = spec.get("torso", (15.5, 8.2))
        out.append((name, {**spec, "torso": (tx * TORSO_X, ty * TORSO_Y), "head_r": spec.get("head_r", 7.4) * HEAD * head,
                           "limb": spec.get("limb", 1.0) * LIMB, "arm": ARM, **slim_arms(spec)}))
    return out


def player_specs():
    return (people.run_cycle() + people.walk_cycle() + people.action_poses()
            + people.sprint_cycle() + people.jockey_cycle() + people.move_poses())


def main():
    meta = people._td_meta()
    cols = len(people.TD_LAYERS)
    frames, _ = people.layered_frames("player", slim(player_specs()))
    save_atlas(OUT / "player", "player-atlas-4", frames, cols=cols, extra=meta, write_frames=False)
    frames, _ = people.layered_frames("player-real", slim(player_specs(), REAL_HEAD))
    save_atlas(OUT / "player", "player-real-atlas-4", frames, cols=cols, extra=meta, write_frames=False)
    frames, _ = people.layered_frames("keeper", slim(people.keeper_poses() + people.keeper_move_poses()))
    save_atlas(OUT / "keeper", "keeper-atlas-4", frames, cols=cols, extra=meta, write_frames=False)
    print("ok")


if __name__ == "__main__":
    main()
