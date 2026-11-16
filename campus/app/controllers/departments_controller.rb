# frozen_string_literal: true

# Lists and reads the university's departments.
class DepartmentsController < ApplicationController
  before_action :authenticate_keycloak!

  def index
    page = integer_parameter(:page, 0)
    size = integer_parameter(:size, 20)
    sort = sort_parameter
    unless valid_department_query?(page, size, sort)
      return render_problem(:bad_request, 'Invalid department list parameters')
    end

    render json: department_page(page, size, sort)
  end

  def show
    department = Department.find_by(id: params[:id])
    return render_problem(:not_found, 'Department not found') unless department

    render json: department_response(department)
  end

  private

  def authenticate_keycloak!
    match = request.authorization.to_s.match(/\ABearer\s+(\S+)\z/i)
    return render_problem(:unauthorized, 'Bearer token is required') unless match

    @token_claims = KeycloakJwt.decode(match[1])
    return if @token_claims['sub'].present?

    render_problem(:unauthorized, 'Bearer token subject is required')
  rescue JWT::DecodeError, JWT::JWKError
    render_problem(:unauthorized, 'Invalid bearer token')
  rescue KeycloakJwt::Unavailable
    render_problem(:service_unavailable, 'Keycloak is unavailable')
  end

  def integer_parameter(name, default)
    Integer(params.fetch(name, default.to_s), 10)
  rescue ArgumentError, TypeError
    nil
  end

  def sort_parameter
    sort = params.fetch(:sort, 'name')
    direction = sort.start_with?('-') ? :desc : :asc
    field = sort.delete_prefix('-')
    return { field => direction } if %w[name acronym].include?(field)

    nil
  end

  def valid_department_query?(page, size, sort)
    page && page >= 0 && size&.positive? && sort
  end

  def department_response(department)
    {
      id: department.id, name: department.name, acronym: department.acronym,
      description: department.description, generalInfoMarkdown: department.general_info_markdown,
      logoUrl: department.logo_url, bannerUrl: department.banner_url, links: department.links,
      administratorUserIds: department.administrator_user_ids
    }
  end

  def department_page(page, size, sort)
    departments = Department.order(sort)
    total_elements = departments.count
    items = departments.offset(page * size).limit(size).map { |department| department_response(department) }
    { items: items, page: page, size: size, totalElements: total_elements,
      totalPages: (total_elements.to_f / size).ceil }
  end
end
