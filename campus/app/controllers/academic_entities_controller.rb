# frozen_string_literal: true

# Lists and edits academic-entity institutional profiles.
class AcademicEntitiesController < ApplicationController
  include KeycloakAuthenticated
  include InstitutionalProfileAuthorization
  include InstitutionalProfileSerialization

  wrap_parameters false

  def index
    page, size, sort = pagination_parameters
    return render_problem(:bad_request, 'Invalid academic entity list parameters') unless page

    entities = AcademicEntity.order(sort)
    total = entities.count
    render json: { items: entities.offset(page * size).limit(size).map { |entity| entity_response(entity) },
                   page: page, size: size, totalElements: total, totalPages: (total.to_f / size).ceil }
  end

  def show
    entity = AcademicEntity.find_by(id: params[:id])
    return render_problem(:not_found, 'Academic entity not found') unless entity

    render json: entity_response(entity)
  end

  def update
    entity = AcademicEntity.find_by(id: params[:id])
    return render_problem(:not_found, 'Academic entity not found') unless entity

    update_entity_profile(entity)
  end

  def destroy
    return unless require_university_admin

    entity = AcademicEntity.find_by(id: params[:id])
    return render_problem(:not_found, 'Academic entity not found') unless entity

    entity.destroy!
    head :no_content
  end

  private

  def update_entity_profile(entity)
    payload = profile_payload(%w[name description generalInfoMarkdown logoUrl bannerUrl links administratorUserIds
                                 entityType departmentId])
    return unless payload
    return unless authorize_profile_update?(entity, payload)
    return unless valid_department_change?(entity, payload)

    assign_entity_fields(entity, payload)
    save_entity(entity)
  end

  def valid_department_change?(entity, payload)
    return true unless payload.key?('departmentId') && payload['departmentId'] != entity.department_id

    unless global_platform_admin?
      render_problem(:forbidden, 'Only the platform administrator can move an academic entity between departments')
      return false
    end
    return true if payload['departmentId'].nil? || Department.exists?(id: payload['departmentId'])

    render_problem(:unprocessable_entity, 'Target department not found')
    false
  end

  def assign_entity_fields(entity, payload)
    assign_profile_fields(entity, payload.except('entityType', 'departmentId'))
    entity.entity_type = payload['entityType'] if payload.key?('entityType')
    entity.department_id = payload['departmentId'] if payload.key?('departmentId')
  end

  def save_entity(entity)
    return render(json: entity_response(entity)) if entity.save

    render_problem(:unprocessable_entity, "Invalid fields: #{entity.errors.attribute_names.uniq.sort.join(', ')}")
  end

  def pagination_parameters
    page = Integer(params.fetch(:page, '0'), 10)
    size = Integer(params.fetch(:size, '20'), 10)
    sort = params.fetch(:sort, 'name')
    direction = sort.start_with?('-') ? :desc : :asc
    field = sort.delete_prefix('-')
    field = 'entity_type' if field == 'entityType'
    return unless page >= 0 && size.between?(1, 100) && %w[name entity_type].include?(field)

    [page, size, { field => direction }]
  rescue ArgumentError, TypeError
    nil
  end

  def entity_response(entity)
    institutional_profile_fields(entity).merge(entityType: entity.entity_type, departmentId: entity.department_id,
                                               sourceUrl: entity.source_url,
                                               sourceAffiliationText: entity.source_affiliation_text,
                                               referenceOnly: entity.reference_only)
  end
end
