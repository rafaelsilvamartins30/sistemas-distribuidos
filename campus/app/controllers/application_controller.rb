# frozen_string_literal: true

# Common API behavior for Campus controllers.
class ApplicationController < ActionController::API
  private

  def render_problem(status, detail)
    render json: problem_document(status, detail), status: status, content_type: 'application/problem+json'
  end

  def problem_document(status, detail)
    status_code = problem_status_code(status)
    {
      type: 'about:blank',
      title: Rack::Utils::HTTP_STATUS_CODES.fetch(status_code),
      status: status_code,
      detail: detail,
      instance: request.path
    }
  end

  def problem_status_code(status)
    return status if status.is_a?(Integer)
    return 422 if status == :unprocessable_entity

    Rack::Utils::SYMBOL_TO_STATUS_CODE.fetch(status)
  end
end
