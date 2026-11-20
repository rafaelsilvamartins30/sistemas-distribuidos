# frozen_string_literal: true

# Department-owned course names used by academic profiles.
class CoursesController < ApplicationController
  include KeycloakAuthenticated
  include InstitutionalProfileAuthorization

  wrap_parameters false

  def index
    department_id = params[:departmentId]
    return render_problem(:bad_request, 'departmentId is required') if department_id.blank?
    return render_problem(:not_found, 'Department not found') unless Department.exists?(id: department_id)

    page = Integer(params.fetch(:page, '0'), 10)
    size = Integer(params.fetch(:size, '100'), 10)
    return render_problem(:bad_request, 'Invalid course list parameters') unless page >= 0 && size.between?(1, 100)

    courses = Course.where(department_id: department_id, reference_only: false).order(:name)
    total = courses.count
    render json: { items: courses.offset(page * size).limit(size).map { |course| course_response(course) },
                   page: page, size: size, totalElements: total, totalPages: (total.to_f / size).ceil }
  rescue ArgumentError, TypeError
    render_problem(:bad_request, 'Invalid course list parameters')
  end

  def show
    course = Course.where(reference_only: false).find_by(id: params[:id])
    return render_problem(:not_found, 'Course not found') unless course

    render json: course_response(course)
  end

  def create
    department = Department.find_by(id: request.request_parameters['departmentId'])
    return render_problem(:not_found, 'Department not found') unless department
    return unless require_profile_admin(department)

    payload = course_payload
    return unless payload

    course = Course.new(id: SecureRandom.uuid, department: department, name: payload.fetch('name'), reference_only: false)
    return render(json: course_response(course), status: :created) if course.save

    render_problem(:unprocessable_entity, "Invalid fields: #{course.errors.attribute_names.uniq.sort.join(', ')}")
  rescue ActiveRecord::RecordNotUnique
    render_problem(:conflict, 'Course already exists in this department')
  end

  def update
    course = Course.where(reference_only: false).find_by(id: params[:id])
    return render_problem(:not_found, 'Course not found') unless course
    return unless require_profile_admin(course.department)

    payload = course_payload
    return unless payload

    course.name = payload.fetch('name')
    return render(json: course_response(course)) if course.save

    render_problem(:unprocessable_entity, "Invalid fields: #{course.errors.attribute_names.uniq.sort.join(', ')}")
  end

  private

  def course_payload
    payload = request.request_parameters
    return render_problem(:bad_request, 'Invalid request body') unless payload.is_a?(Hash)
    return render_problem(:bad_request, "Invalid fields: #{(payload.keys - ['name']).join(', ')}") unless
      (payload.keys - ['name']).empty?
    return render_problem(:bad_request, 'name is required') unless payload['name'].is_a?(String) && payload['name'].present?

    { 'name' => payload['name'] }
  end

  def course_response(course)
    { id: course.id, name: course.name, departmentId: course.department_id }
  end
end
