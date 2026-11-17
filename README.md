# Also Liked

Steam game recommendations from what other players liked and didn't like.
Pick games you loved (and ones you didn't) and it suggests games that players
with the same taste recommended.

Data: [Game Recommendations on Steam](https://www.kaggle.com/code/namxz21/game-recommendations/input) (Kaggle), about 41M reviews.

## How it works

Item-based collaborative filtering. Each reviewer is a vector over games:
+1 if they recommended a game, -1 if they didn't, 0 if they never reviewed it.
Two games are similar when the same people feel the same way about both
(cosine similarity). A game gets pushed down when its fans also like something
you disliked.


- Raw counts mostly return whatever is popular, so I use cosine similarity, which normalizes for popularity.
- Pairs of games with few shared reviewers are discounted (`overlap / (overlap + 50)`), so a lucky coincidence doesn't rank first.
- Users with fewer than 5 reviews carry little signal, and users with more than 200 are likely bots or collectors, so both are filtered out.
- Similarity is computed once, offline. The site only loads two small JSON files, so hosting is free and lookups are instant.


## Limits

- Only the ~4,000 most-reviewed games are included.
- Reviews are recommend / don't recommend, with no star scale.
- Dataset reviews end in 2022, so newer games are missing.
