1. ~~need to fix unreadable text in headers in night mode on dashboard cards~~ FIXED: Changed invalid `dark:bg-gray-750` to `dark:bg-gray-700` in DashboardCard.tsx
2. ~~need to figure out some way to prune players from the index who havent played a minor league game in over a year~~ FIXED: Added pruning logic to build_player_index.py - players inactive for 365+ days are now automatically removed from the index
3. ~~refresh button doesnt do anything. not sure what its supposed to do, maybe refresh the player index but i think we can just get rid of it~~ FIXED: Removed the refresh button from DataStatusIndicator.tsx
4. long term, maybe we can look at more frequent refresh of data during the season so its basically live data? not sure how realistic this is - SHELVED for now; updated schedule to run at 12:01 AM UTC nightly

---

## New TODOs (identified 1.24.26)

### Completed
5. ~~Replace confirm() dialogs with modal confirmations~~ FIXED: Created ConfirmModal component, updated TabBar and StatsTable to use it
6. ~~Add drag-to-reorder for team tabs~~ FIXED: Added HTML5 drag-and-drop to TabBar
7. ~~Create SettingsModal component~~ FIXED: Created SettingsModal with dark mode, default split, stat categories, and auto-refresh settings
8. ~~Add CSV export functionality (Spec 2.8.2)~~ FIXED: Added exportToCSV utility and Export CSV button to StatsTable
9. ~~Implement charts with Recharts~~ FIXED: Created PlayerDetailModal with Charts tab showing player performance over time (rolling averages, trend indicators)
10. ~~Pitcher BABIP doesn't calculate correctly~~ FIXED: Updated formula in statsCalculator.ts to use (H - HR) / (3*IP + H - SO - HR)
11. ~~Fix type safety issues~~ FIXED: Removed `(player as any).fangraphsId` casts, deleted unused GameLogModal.tsx
12. ~~Add error handling to database operations~~ FIXED: Added try-catch blocks and TeamOperationResult/TeamPlayerOperationResult types to useTeams.ts and useTeamPlayers.ts
13. ~~Remove unused code~~ FIXED: Removed `selectedPlayerIds` state and related functions from useUIStore.ts. Note: PlayersRegistry IS used in StatsTable.tsx

### Pending

#### High Priority
14. PlayerDetailModal "More Info" tab - add external links (FanGraphs, MLB.com) and prospect rankings
15. True wRC+ calculations - implement proper league-adjusted wRC+ with park factors if available

#### Medium Priority
16. Trend sparklines in stats table - small inline charts showing recent performance

#### Lower Priority (Phase 2+ features from spec)
17. Player comparison tool (Spec 2.8.1)
18. Additional splits: vs Left/Right, Home/Away (Spec 2.5)
19. Alerts & notifications system (Spec 2.6)
20. STATCAST SUPPORT
