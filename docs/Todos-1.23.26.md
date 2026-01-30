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
21. ~~Add chart legend showing level colors directly on the chart~~ FIXED: Integrated custom Legend component in PlayerCharts.tsx that shows metric line + level color indicators
22. ~~Handedness splits - vs Left/Right pitcher/batter~~ FIXED: Added SituationalSplit type, filtering functions in statsCalculator.ts, Splits tab in PlayerDetailModal, and Filter dropdown in Controls
23. ~~Home/Away splits~~ FIXED: Added home/away filtering using existing isHome field in GameLogEntry, displayed in new Splits tab and available as Filter option

### Pending

#### High Priority
14. ~~PlayerDetailModal "More Info" tab - add external links (FanGraphs, MLB.com, Prospect Savant) and prospect rankings~~ FIXED: Added external links to Prospect Savant, MiLB.com, FanGraphs, and MLB.com using the player's mlbId. Prospect rankings still TBD (no reliable static data source).
15. True wRC+ calculations - implement proper league-adjusted wRC+ with park factors if available (may need to use three year average park factors for 2022-2024 from Baseball America, https://www.baseballamerica.com/stories/three-year-minor-league-park-factors-including-left-right-splits/)
16. ~~Currently aggregate batted ball stats by PA rather than BIP, let's calculate BIP using the play by play data then use that as a denominator~~ FIXED: Python script now outputs BIP count; frontend aggregates batted ball rate stats (GB%, FB%, LD%, HR/FB, Pull%, Pull-Air%) using BIP-weighted averaging instead of PA
17. Add handedness splits using the PBP data.
19. ~~Pull-air should use the number of batted balls in the air (FB+LD) as a denominator, so it's percentage of fly balls and line drives that are pulled~~ VERIFIED: Already implemented correctly - Pull-Air% uses air_balls_with_direction (FB+LD) as denominator in calculate_advanced_stats.py

24. Add Pull% and Pull-Air% to rolling charts (PlayerCharts.tsx BATTER_METRICS)
25. UI fixes: remove blank gap at beginning of rolling charts before minimum threshold is reached; improve Teams display mobile accessibility

#### Medium Priority
20. Trend sparklines in stats table - small inline charts showing recent performance

#### Lower Priority (Phase 2+ features from spec)
21. Player comparison tool (Spec 2.8.1)
22. Alerts & notifications system (Spec 2.6)
23. STATCAST SUPPORT
