"""Atlases of the top-down figures with the richer set of moves (player-atlas-2, player-real-atlas-2, keeper-atlas-2).

Only the three atlas sheets are written (no single-frame files): the old atlases stay as they are, because game art
URLs are cached for good and a changed sheet needs a new name. Usage: python build_moves_atlas.py
"""
import people
from common import OUT, save_atlas


def player_specs(extra=None):
    return (people.run_cycle(extra) + people.walk_cycle(extra) + people.action_poses(extra)
            + people.sprint_cycle(extra) + people.jockey_cycle(extra) + people.move_poses(extra))


def main():
    meta = people._td_meta()
    cols = len(people.TD_LAYERS)
    frames, _ = people.layered_frames("player", player_specs())
    save_atlas(OUT / "player", "player-atlas-2", frames, cols=cols, extra=meta, write_frames=False)
    real = people.PROPORTIONS["real"]
    frames, _ = people.layered_frames("player-real", player_specs(real))
    save_atlas(OUT / "player", "player-real-atlas-2", frames, cols=cols, extra=meta, write_frames=False)
    frames, _ = people.layered_frames("keeper", people.keeper_poses() + people.keeper_move_poses())
    save_atlas(OUT / "keeper", "keeper-atlas-2", frames, cols=cols, extra=meta, write_frames=False)
    print("ok")


if __name__ == "__main__":
    main()
