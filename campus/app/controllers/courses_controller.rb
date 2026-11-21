# frozen_string_literal: true

# Department-owned course names used by academic profiles.
class CoursesController < ApplicationController
  include KeycloakAuthenticated
  include InstitutionalProfileAuthorization

  wrap_parameters false

  def index
    department_id = params[:departmentId]
    return unless valid_course_department?(department_id)

    page, size = course_page_values
    return unless page

    courses = Course.where(department_id: department_id, reference_only: false).order(:name)
    render json: course_page(courses, page, size)
  end

  def show
    course = Course.where(reference_only: false).find_by(id: params[:id])
    return render_problem(:not_found, 'Course not found') unless course

    render json: course_response(course)
  end

  def create
    department = Department.find_by(id: request.request_parameters['departmentId'])
    return render_problem(:not_found, 'Department not found') unless department
    return unless authorize_profile_admin?(department)

    payload = course_payload
    return unless payload

    create_course(department, payload)
  rescue ActiveRecord::RecordNotUnique
    render_problem(:conflict, 'Course already exists in this department')
  end

  def update
    course = Course.where(reference_only: false).find_by(id: params[:id])
    return render_problem(:not_found, 'Course not found') unless course
    return unless authorize_profile_admin?(course.department)

    payload = course_payload
    return unless payload

    update_course(course, payload)
  end

  private

  def valid_course_department?(department_id)
    if department_id.blank?
      render_problem(:bad_request, 'departmentId is required')
      return false
    end
    return true if Department.exists?(id: department_id)

    render_problem(:not_found, 'Department not found')
    false
  end

  def course_page_values
    page = Integer(params.fetch(:page, '0'), 10)
    size = Integer(params.fetch(:size, '100'), 10)
    return render_problem(:bad_request, 'Invalid course list parameters') unless page >= 0 && size.between?(1, 100)

    [page, size]
  rescue ArgumentError, TypeError
    render_problem(:bad_request, 'Invalid course list parameters')
  end

  def course_page(courses, page, size)
    total = courses.count
    { items: courses.offset(page * size).limit(size).map { |course| course_response(course) },
      page: page, size: size, totalElements: total, totalPages: (total.to_f / size).ceil }
  end

  def create_course(department, payload)
    course = Course.new(id: SecureRandom.uuid, department: department, name: payload.fetch('name'),
                        reference_only: false)
    return render(json: course_response(course), status: :created) if course.save

    render_course_validation_error(course)
  end

  def update_course(course, payload)
    course.name = payload.fetch('name')
    return render(json: course_response(course)) if course.save

    render_course_validation_error(course)
  end

  def render_course_validation_error(course)
    render_problem(:unprocessable_entity, "Invalid fields: #{course.errors.attribute_names.uniq.sort.join(', ')}")
  end

  def course_payload
    payload = request.request_parameters
    error = course_payload_error(payload)
    return render_problem(:bad_request, error) if error

    { 'name' => payload['name'] }
  end

  def course_payload_error(payload)
    return 'Invalid request body' unless payload.is_a?(Hash)

    invalid = payload.keys - ['name']
    return "Invalid fields: #{invalid.join(', ')}" if invalid.any?
    return 'name is required' unless payload['name'].is_a?(String) && payload['name'].present?

    nil
  end

  def course_response(course)
    { id: course.id, name: course.name, departmentId: course.department_id }
  end
end
