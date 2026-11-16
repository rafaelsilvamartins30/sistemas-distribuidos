# frozen_string_literal: true

# Lists and reads academic entities using the public Campus profile fields.
class AcademicEntitiesController < ApplicationController
  before_action :authenticate_keycloak!

  def index
    page = integer_parameter(:page, 0)
    size = integer_parameter(:size, 20)
    sort = sort_parameter
    unless page && page >= 0 && size&.positive? && sort
      return render_problem(:bad_request, 'Invalid academic entity list parameters')
    end

    render json: academic_entity_page(page, size, sort)
  end

  def show
    entity = AcademicEntity.find_by(id: params[:id])
    return render_problem(:not_found, 'Academic entity not found') unless entity

    render json: academic_entity_response(entity)
  end

  private

  def authenticate_keycloak!
    match = request.authorization.to_s.match(/\ABearer\s+(\S+)\z/i)
    return render_problem(:unauthorized, 'Bearer token is required') unless match

    claims = KeycloakJwt.decode(match[1])
    return if claims['sub'].present?

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
    field = 'entity_type' if field == 'entityType'
    return { field => direction } if %w[name entity_type].include?(field)

    nil
  end

  def academic_entity_response(entity)
    {
      id: entity.id, name: entity.name, description: entity.description,
      generalInfoMarkdown: entity.general_info_markdown, entityType: entity.entity_type,
      departmentId: entity.department_id, logoUrl: entity.logo_url, bannerUrl: entity.banner_url,
      links: entity.links, managerUserIds: entity.manager_user_ids
    }
  end

  def academic_entity_page(page, size, sort)
    entities = AcademicEntity.order(sort)
    total_elements = entities.count
    items = entities.offset(page * size).limit(size).map { |entity| academic_entity_response(entity) }
    { items: items, page: page, size: size, totalElements: total_elements,
      totalPages: (total_elements.to_f / size).ceil }
  end
end
