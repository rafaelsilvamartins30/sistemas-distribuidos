# frozen_string_literal: true

Rails.application.routes.draw do
  get 'health/live', to: 'health#live'
  get 'health/ready', to: 'health#ready'

  post 'users', to: 'users#create'
  get 'users/me', to: 'users#show_me'
  patch 'users/me', to: 'users#update_me'

  get 'university', to: 'universities#show'
  get 'departments', to: 'departments#index'
  get 'departments/:id', to: 'departments#show'
  get 'entities', to: 'academic_entities#index'
  get 'entities/:id', to: 'academic_entities#show'
  get 'communities', to: 'communities#index'
  get 'communities/:id', to: 'communities#show'

  get 'internal/v1/opportunity-publishers', to: 'opportunity_publishers#index'
  get 'internal/v1/event-organizers', to: 'event_organizers#index'
  get 'professor-verification-requests/me', to: 'professor_verification_requests#index'
  post 'professor-verification-requests', to: 'professor_verification_requests#create'
  get 'departments/:department_id/professor-verification-requests',
      to: 'department_professor_verification_requests#index'
  post 'professor-verification-requests/:id/approve', to: 'department_professor_verification_requests#approve'
  post 'professor-verification-requests/:id/reject', to: 'department_professor_verification_requests#reject'
end
