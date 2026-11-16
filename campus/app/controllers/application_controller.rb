# frozen_string_literal: true

# Common API behavior for Campus controllers.
class ApplicationController < ActionController::API
  private

  def render_problem(status, detail)
    status_code = status.is_a?(Integer) ? status : Rack::Utils::SYMBOL_TO_STATUS_CODE.fetch(status)
    render json: {
      type: 'about:blank',
      title: Rack::Utils::HTTP_STATUS_CODES.fetch(status_code),
      status: status_code,
      detail: detail,
      instance: request.path
    }, status: status, content_type: 'application/problem+json'
  end
end
