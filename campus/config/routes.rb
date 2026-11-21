# frozen_string_literal: true

Rails.application.routes.draw do
  get 'health/live', to: 'health#live'
  get 'health/ready', to: 'health#ready'

  draw :profiles
  draw :social
  draw :requests
  draw :internal
end
