# frozen_string_literal: true

get 'internal/v1/opportunity-publishers', to: 'opportunity_publishers#index'
get 'internal/v1/event-organizers', to: 'event_organizers#index'
post 'internal/v1/refund-notifications', to: 'notifications#sync_refunds'
get 'professor-verification-requests/me', to: 'professor_verification_requests#index'
post 'professor-verification-requests', to: 'professor_verification_requests#create'
get 'departments/:department_id/professor-verification-requests',
    to: 'department_professor_verification_requests#index'
post 'professor-verification-requests/:id/approve', to: 'department_professor_verification_requests#approve'
post 'professor-verification-requests/:id/reject', to: 'department_professor_verification_requests#reject'
