# frozen_string_literal: true

get 'requests/me', to: 'institutional_requests#index'
get 'requests/pending', to: 'institutional_requests#pending'
post 'requests', to: 'institutional_requests#create'
post 'requests/:id/approve', to: 'institutional_requests#approve'
post 'requests/:id/reject', to: 'institutional_requests#reject'
