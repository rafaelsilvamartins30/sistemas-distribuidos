# Campus institutional profiles and social API

Campus owns institutional profiles, follows, the signed-in user's feed, community conversations, request decisions, and in-app notifications. The Web calls these routes through the Gateway and Web BFF; Campus retains the original Keycloak bearer token and derives the acting subject from its verified `sub` claim.

Institutional detail screens share a `Perfil` and `Publicações` tab. Communities add `Central da comunidade`. Profile Markdown and labeled contacts are rendered on the profile tab; notification links open the corresponding profile tab. The Markdown renderer supports headings, paragraphs, lists, blockquotes, emphasis, inline code, and safe `http(s)`, `mailto`, or `tel` links. Raw HTML is rendered as text.

## Profile publications and feed

- `GET /profiles/{profileType}/{profileId}/posts?term={term}` lists the complete institutional post history for a profile and semester, including posts past their display deadline. `POST` on the same route publishes for the authenticated administrator of the profile.
- The profile type is one of the existing Campus profile classes: University, AcademicUnit, Department, AcademicEntity, or Community. The active semester defaults to `University.current_term`.
- A post can contain text, image URLs, an external URL, an `availableUntil` timestamp, and optionally a poll. A poll needs a question and at least two option strings. There are no likes or internal applications.
- `GET /feed?term={term}` returns current, non-expired institutional posts from profiles the authenticated user follows. Posts remain queryable in profile history after `availableUntil`; expiration hides a post from the followed feed without deleting the stored record. Social responses use author display names without exposing Keycloak subjects.
- `POST /polls/{pollId}/votes` records one vote per authenticated subject. Campus rejects a second vote and votes after the poll's `closesAt`.

## Follows and community space

- `GET /follows` returns the authenticated user's active follows without follower counts. `POST /follows` accepts `targetType` and `targetId`; `DELETE /follows/{id}` soft-ends only the caller's follow.
- `GET /communities/{communityId}/space/posts` lists the community's conversation posts. An authenticated user must actively follow that Community to create a post or comment.
- `POST /communities/{communityId}/space/posts` accepts the same post body without a semester field. `GET,POST /community-space-posts/{postId}/comments` reads comments and creates a comment or a reply using `parentCommentId`. Replies must belong to the same post.
- Community discussion writes do not create likes or membership records. A Community may optionally belong to a Department; no Department means the University-level Community.

## Requests and notifications

- `POST /requests` accepts `COMMUNITY_CREATION` or `ENTITY_CREATION`, a `targetDepartmentId` (or null/omitted for the University), and profile details. Client-supplied administrator IDs are rejected. Campus stores the request as pending and notifies administrators of the target.
- `GET /requests/me` returns the caller's request history. `GET /requests/pending` returns pending requests for targets administered by the caller. Approve/reject rechecks target administrators in Campus.
- `GET /notifications` returns only the caller's notifications, with pagination and `unreadCount`. `POST /notifications/{id}/read` marks one caller-owned notification as read; `POST /notifications/read-all` marks all of the caller's unread notifications.
- Request decisions, new posts to followed profiles, community posts, and direct comment/reply recipients create in-app notifications. Profile notifications carry the profile type and ID as their navigation target; community activity opens its Community profile. Notifications are retained in Campus and are not sent through an external messaging service in this change.

The database keeps publication, request, vote, follow, and notification history. Follow removal and post expiry do not delete historical records. No changes are made to Payment, Access, Event Saga, or Engagement ownership.

Poll results are visible only after the caller votes or the poll closes. Campus
returns null for option `votes` and `totalVotes` while results are hidden.
GET `/follows` accepts `targetType` and `targetId` together to limit the caller's
follow list to one profile. The feed's ordering is provided by Campus.
