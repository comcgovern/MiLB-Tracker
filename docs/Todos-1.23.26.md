1. ~~need to fix unreadable text in headers in night mode on dashboard cards~~ FIXED: Changed invalid `dark:bg-gray-750` to `dark:bg-gray-700` in DashboardCard.tsx
2. ~~need to figure out some way to prune players from the index who havent played a minor league game in over a year~~ FIXED: Added pruning logic to build_player_index.py - players inactive for 365+ days are now automatically removed from the index
3. ~~refresh button doesnt do anything. not sure what its supposed to do, maybe refresh the player index but i think we can just get rid of it~~ FIXED: Removed the refresh button from DataStatusIndicator.tsx
4. long term, maybe we can look at more frequent refresh of data during the season so its basically live data? not sure how realistic this is - SHELVED for now; updated schedule to run at 12:01 AM UTC nightly

---

## New TODOs (identified 1.24.26)

### Completed
5. ~~Replace confirm() dialogs with modal confirmations~~ FIXED: Created ConfirmModal component, updated TabBar and StatsTable to use it
6. ~~Add drag-to-reorder for team tabs~~ FIXED: Added HTML5 drag-and-drop to TabBar

### Pending

#### High Priority
7. Create SettingsModal component - button exists in header but modal not implemented
8. Add CSV export functionality (Spec 2.8.2)
9. Implement charts with Recharts - package installed but unused
10. Pitcher BABIP doesn't calculate correctly, either implement or remove

#### Medium Priority
10. Fix type safety issues - remove `(player as any).fangraphsId` casts in types/index.ts and GameLogModal.tsx
11. Add error handling to database operations in useTeams.ts and useTeamPlayers.ts
12. Remove unused imports and code:
    - `PlayersRegistry` import in StatsTable.tsx
    - `selectedPlayerIds` state in useUIStore.ts
    - recharts package (if not implementing charts)

#### Lower Priority (Phase 2+ features from spec)
13. Player comparison tool (Spec 2.8.1)
14. Additional splits: vs Left/Right, Home/Away (Spec 2.5)
15. Alerts & notifications system (Spec 2.6)
16. STATCAST SUPPORT
