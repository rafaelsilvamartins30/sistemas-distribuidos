# frozen_string_literal: true

# Renders paginated collections using the Campus API response contract.
module CampusPagination
  extend ActiveSupport::Concern

  private

  def render_paginated(scope, page_size: 20, &)
    page, size = pagination_values(page_size)
    return unless page

    render json: paginated_response(scope, page, size, scope.count, &)
  rescue ArgumentError, TypeError
    render_problem(:bad_request, 'Invalid pagination parameters')
  end

  def pagination_values(page_size)
    page = Integer(params.fetch(:page, '0'), 10)
    size = Integer(params.fetch(:size, page_size.to_s), 10)
    return render_problem(:bad_request, 'Invalid pagination parameters') unless page >= 0 && size.between?(1, 100)

    [page, size]
  rescue ArgumentError, TypeError
    render_problem(:bad_request, 'Invalid pagination parameters')
  end

  def paginated_response(scope, page, size, total, &)
    { items: scope.offset(page * size).limit(size).map(&), page: page, size: size,
      totalElements: total, totalPages: (total.to_f / size).ceil }
  end
end
