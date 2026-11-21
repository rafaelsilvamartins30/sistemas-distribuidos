# frozen_string_literal: true

get 'communities/:community_id/space/posts', to: 'community_space_posts#index'
post 'communities/:community_id/space/posts', to: 'community_space_posts#create'
get 'community-space-posts/:post_id/comments', to: 'comments#index'
post 'community-space-posts/:post_id/comments', to: 'comments#create'
post 'polls/:poll_id/votes', to: 'poll_votes#create'
get 'follows', to: 'follows#index'
post 'follows', to: 'follows#create'
delete 'follows/:id', to: 'follows#destroy'
get 'notifications', to: 'notifications#index'
post 'notifications/read-all', to: 'notifications#mark_all_read'
post 'notifications/:id/read', to: 'notifications#mark_read'
