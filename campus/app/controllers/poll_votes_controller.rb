# frozen_string_literal: true

# Records one immutable vote per authenticated user and poll.
class PollVotesController < ApplicationController
  include KeycloakAuthenticated

  wrap_parameters false

  def create
    poll = Poll.find_by(id: params[:poll_id])
    return render_problem(:not_found, 'Poll not found') unless poll
    return render_problem(:conflict, 'Poll is closed') if poll.closed?

    payload = request.request_parameters
    return render_problem(:bad_request, 'optionId is required') unless payload.is_a?(Hash) &&
      payload.keys == ['optionId'] && payload['optionId'].is_a?(String)
    option = poll.poll_options.find_by(id: payload['optionId'])
    return render_problem(:bad_request, 'Option does not belong to this poll') unless option

    vote = poll.poll_votes.new(id: SecureRandom.uuid, user_id: current_subject, poll_option: option)
    return render(json: CampusSocialResponse.poll(poll, voter_id: current_subject), status: :created) if vote.save

    render_problem(:conflict, 'A user may vote only once in a poll')
  rescue ActiveRecord::RecordNotUnique
    render_problem(:conflict, 'A user may vote only once in a poll')
  end
end
