// Per-sport configuration. Market ids are OpticOdds ids, verified against
// /markets for DraftKings. Add a league by copying a block; the catalog
// route silently skips any market the book doesn't offer for that fixture.

export const SPORTS = {
  nfl: {
    label: "NFL",
    sport: "football",
    league: "nfl",
    core: ["moneyline", "point_spread", "total_points", "team_total"],
    props: [
      "player_passing_yards",
      "player_passing_touchdowns",
      "player_rushing_yards",
      "player_receiving_yards",
      "player_receptions",
      "player_touchdowns",
      "player_interceptions",
    ],
    vocab:
      '"Wins big" = alt spread of -6.5 or steeper. "Big game" for a QB = passing yards alt over and/or 2+ passing TDs. For a receiver = receiving yards alt over and/or anytime TD. "Ground game" = rushing yards overs. "Struggles" for a QB = interception over or passing yards under.',
  },
  ncaaf: {
    label: "NCAAF",
    sport: "football",
    league: "ncaaf",
    core: ["moneyline", "point_spread", "total_points", "team_total"],
    props: [
      "player_passing_yards",
      "player_passing_touchdowns",
      "player_rushing_yards",
      "player_receiving_yards",
      "player_receptions",
      "player_touchdowns",
      "player_interceptions",
    ],
    vocab:
      '"Wins big" = alt spread of -10.5 or steeper (college margins run wide). "Big game" = yardage alt over and/or TD.',
  },
  nba: {
    label: "NBA",
    sport: "basketball",
    league: "nba",
    core: ["moneyline", "point_spread", "total_points", "team_total"],
    props: [
      "player_points",
      "player_rebounds",
      "player_assists",
      "player_made_threes",
      "player_points_+_rebounds_+_assists",
      "player_steals",
      "player_blocks",
      "player_turnovers",
      "player_double_double",
    ],
    vocab:
      '"Goes off" / "big night" = points alt over; "does everything" = PRA over or double-double. "Wins big" = alt spread of -8.5 or steeper. "Shootout" = game total over.',
  },
  mlb: {
    label: "MLB",
    sport: "baseball",
    league: "mlb",
    core: ["moneyline", "run_line", "total_runs", "team_total"],
    props: [
      "player_hits",
      "player_home_runs",
      "player_bases",
      "player_rbis",
      "player_runs",
      "player_strikeouts",
      "player_earned_runs",
      "player_outs",
      "player_stolen_bases",
    ],
    vocab:
      '"Wins big" = run line -1.5. "Pitcher dominates" = strikeouts over and earned runs under. "Bats wake up" = hits/total bases overs and team total over. "Goes deep" = home run yes.',
  },
  nhl: {
    label: "NHL",
    sport: "hockey",
    league: "nhl",
    core: ["moneyline", "puck_line", "total_goals", "team_total"],
    props: [
      "player_points",
      "player_goals",
      "player_assists",
      "player_shots_on_goal",
      "anytime_goal_scorer",
      "player_saves",
      "player_blocked_shots",
    ],
    vocab:
      '"Wins big" = puck line -1.5. "Big game" for a skater = points over or anytime goal. "Goalie stands on his head" = saves over and opponent team total under.',
  },
  epl: {
    label: "Premier League",
    sport: "soccer",
    league: "england_-_premier_league",
    core: ["moneyline", "asian_handicap", "total_goals", "team_total", "both_teams_to_score", "draw_no_bet"],
    props: [
      "anytime_goal_scorer",
      "player_shots",
      "player_shots_on_target",
      "player_assists",
      "player_cards",
      "player_fouls",
      "player_tackles",
      "player_saves",
    ],
    vocab:
      'Moneyline is 3-way (home / draw / away). "Wins comfortably" = asian handicap -1 or -1.5. "Scrappy" / "tight" = under 2.5 goals, player cards. "Open game" = over 2.5, BTTS yes. "Dominates" = team total over and opponent shots under.',
  },
};

export const SPORT_KEYS = Object.keys(SPORTS);
