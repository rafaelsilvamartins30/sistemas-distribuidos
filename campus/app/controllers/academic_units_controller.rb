# frozen_string_literal: true

# Lists, creates, and edits academic-unit profiles at the same level as departments.
class AcademicUnitsController < ApplicationController
  include KeycloakAuthenticated
  include InstitutionalProfileAuthorization
  include InstitutionalProfileSerialization

  wrap_parameters false

  def index
    page, size, sort = pagination_parameters
    return render_problem(:bad_request, 'Invalid academic unit list parameters') unless page

    units = AcademicUnit.order(sort)
    total = units.count
    items = units.offset(page * size).limit(size).map { |unit| academic_unit_response(unit) }
    render json: { items: items, page: page, size: size, totalElements: total,
                   totalPages: (total.to_f / size).ceil }
  end

  def show
    unit = AcademicUnit.find_by(id: params[:id])
    return render_problem(:not_found, 'Academic unit not found') unless unit

    render json: academic_unit_response(unit)
  end

  def create
    return unless require_university_admin

    payload = profile_payload(%w[code name description generalInfoMarkdown logoUrl bannerUrl links
                                 administratorUserIds])
    return unless payload

    create_academic_unit(payload)
  end

  private

  def create_academic_unit(payload)
    unit = AcademicUnit.new(id: SecureRandom.uuid)
    assign_profile_fields(unit, payload.except('code'))
    unit.administrator_user_ids = (Array(unit.administrator_user_ids) + [current_subject]).uniq
    unit.code = payload['code']
    return render(json: academic_unit_response(unit), status: :created) if unit.save

    render_validation_error(unit)
  end

  public

  def update
    unit = AcademicUnit.find_by(id: params[:id])
    return render_problem(:not_found, 'Academic unit not found') unless unit

    payload = profile_payload(%w[code name description generalInfoMarkdown logoUrl bannerUrl links
                                 administratorUserIds])
    return unless payload
    return unless authorize_profile_update?(unit, payload)

    assign_profile_fields(unit, payload.except('code'))
    unit.code = payload['code'] if payload.key?('code')
    return render(json: academic_unit_response(unit)) if unit.save

    render_validation_error(unit)
  end

  private

  def pagination_parameters
    page = Integer(params.fetch(:page, '0'), 10)
    size = Integer(params.fetch(:size, '20'), 10)
    sort = params.fetch(:sort, 'name')
    direction = sort.start_with?('-') ? :desc : :asc
    field = sort.delete_prefix('-')
    return unless page >= 0 && size.between?(1, 100) && %w[name code].include?(field)

    [page, size, { field => direction }]
  rescue ArgumentError, TypeError
    nil
  end

  def academic_unit_response(unit)
    institutional_profile_fields(unit).merge(code: unit.code, sourceUrl: unit.source_url,
                                             referenceOnly: unit.reference_only)
  end

  def render_validation_error(profile)
    render_problem(:unprocessable_entity, "Invalid fields: #{profile.errors.attribute_names.uniq.sort.join(', ')}")
  end
end
