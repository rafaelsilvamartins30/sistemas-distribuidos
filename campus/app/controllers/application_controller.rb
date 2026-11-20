# frozen_string_literal: true

# Common API behavior for Campus controllers.
class ApplicationController < ActionController::API
  private

  def render_problem(status, detail)
    status_code = if status.is_a?(Integer)
                    status
                  elsif status == :unprocessable_entity
                    422
                  else
                    Rack::Utils::SYMBOL_TO_STATUS_CODE.fetch(status)
                  end
    render json: {
      type: 'about:blank',
      title: Rack::Utils::HTTP_STATUS_CODES.fetch(status_code),
      status: status_code,
      detail: detail,
      instance: request.path
    }, status: status, content_type: 'application/problem+json'
  end
end
