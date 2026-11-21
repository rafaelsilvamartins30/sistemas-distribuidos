# frozen_string_literal: true

# Lists, creates, and edits department institutional profiles.
class DepartmentsController < ApplicationController
  include KeycloakAuthenticated
  include InstitutionalProfileAuthorization
  include InstitutionalProfileSerialization

  wrap_parameters false

  def index
    page, size, sort = pagination_parameters(%w[name acronym])
    return render_problem(:bad_request, 'Invalid department list parameters') unless page

    departments = Department.order(sort)
    render json: page_response(departments, page, size) { |department| department_response(department) }
  end

  def show
    department = Department.find_by(id: params[:id])
    return render_problem(:not_found, 'Department not found') unless department

    render json: department_response(department, include_courses: true)
  end

  def create
    return unless require_university_admin

    payload = profile_payload(%w[name acronym description generalInfoMarkdown logoUrl bannerUrl links
                                 administratorUserIds])
    return unless payload

    create_department(payload)
  end

  private

  def create_department(payload)
    department = Department.new(id: SecureRandom.uuid)
    assign_profile_fields(department, payload.except('acronym'))
    department.administrator_user_ids = (Array(department.administrator_user_ids) + [current_subject]).uniq
    department.acronym = payload['acronym']
    return render(json: department_response(department), status: :created) if department.save

    render_profile_validation_error(department)
  end

  public

  def update
    department = Department.find_by(id: params[:id])
    return render_problem(:not_found, 'Department not found') unless department

    payload = profile_payload(%w[name acronym description generalInfoMarkdown logoUrl bannerUrl links
                                 administratorUserIds])
    return unless payload
    return unless authorize_profile_update?(department, payload)

    assign_profile_fields(department, payload.except('acronym'))
    department.acronym = payload['acronym'] if payload.key?('acronym')
    return render(json: department_response(department)) if department.save

    render_profile_validation_error(department)
  end

  private

  def pagination_parameters(fields)
    page = Integer(params.fetch(:page, '0'), 10)
    size = Integer(params.fetch(:size, '20'), 10)
    sort = params.fetch(:sort, 'name')
    direction = sort.start_with?('-') ? :desc : :asc
    field = sort.delete_prefix('-')
    return unless page >= 0 && size.between?(1, 100) && fields.include?(field)

    [page, size, { field => direction }]
  rescue ArgumentError, TypeError
    nil
  end

  def page_response(scope, page, size, &)
    total = scope.count
    { items: scope.offset(page * size).limit(size).map(&), page: page, size: size,
      totalElements: total, totalPages: (total.to_f / size).ceil }
  end

  def department_response(department, include_courses: false)
    response = institutional_profile_fields(department).merge(acronym: department.acronym,
                                                              sourceUrl: department.source_url)
    if include_courses
      response[:courses] = department.courses.where(reference_only: false).order(:name).map do |course|
        course_response(course)
      end
    end
    response
  end

  def course_response(course)
    { id: course.id, name: course.name, departmentId: course.department_id }
  end

  def render_profile_validation_error(profile)
    render_problem(:unprocessable_entity, "Invalid fields: #{profile.errors.attribute_names.uniq.sort.join(', ')}")
  end
end
