package br.unir.engagement.service;

import br.unir.engagement.client.CampusEventOrganizerClient;
import br.unir.engagement.dto.CompetitionResponse;
import br.unir.engagement.dto.CreateCompetitionRequest;
import br.unir.engagement.dto.CreateSeasonRequest;
import br.unir.engagement.dto.CreateSportRequest;
import br.unir.engagement.dto.CreateSportsTeamRequest;
import br.unir.engagement.dto.EventOrganizerContext;
import br.unir.engagement.dto.EventOrganizerContextsResponse;
import br.unir.engagement.dto.GenerateSportsMatchesRequest;
import br.unir.engagement.dto.MySportsEnrollmentResponse;
import br.unir.engagement.dto.MySportsEnrollmentsResponse;
import br.unir.engagement.dto.MySportsMatchResponse;
import br.unir.engagement.dto.MySportsMatchesResponse;
import br.unir.engagement.dto.RecordSportsMatchScoreRequest;
import br.unir.engagement.dto.RegisterFreeAgentRequest;
import br.unir.engagement.dto.RegistrationPaymentRequestedPayload;
import br.unir.engagement.dto.SeasonResponse;
import br.unir.engagement.dto.SportResponse;
import br.unir.engagement.dto.SportsEventOverviewResponse;
import br.unir.engagement.dto.SportsFreeAgentRegistrationResponse;
import br.unir.engagement.dto.SportsFreeAgentResponse;
import br.unir.engagement.dto.SportsMatchCheckInRequest;
import br.unir.engagement.dto.SportsMatchCheckInResponse;
import br.unir.engagement.dto.SportsMatchCheckInTokenResponse;
import br.unir.engagement.dto.SportsMatchResponse;
import br.unir.engagement.dto.SportsTeamMemberResponse;
import br.unir.engagement.dto.SportsTeamResponse;
import br.unir.engagement.entity.Competition;
import br.unir.engagement.entity.OutboxEvent;
import br.unir.engagement.entity.Season;
import br.unir.engagement.entity.Sport;
import br.unir.engagement.entity.SportsFreeAgent;
import br.unir.engagement.entity.SportsMatch;
import br.unir.engagement.entity.SportsMatchCheckIn;
import br.unir.engagement.entity.SportsTeam;
import br.unir.engagement.entity.SportsTeamMember;
import br.unir.engagement.repository.CompetitionRepository;
import br.unir.engagement.repository.OutboxRepository;
import br.unir.engagement.repository.SeasonRepository;
import br.unir.engagement.repository.SportRepository;
import br.unir.engagement.repository.SportsFreeAgentRepository;
import br.unir.engagement.repository.SportsMatchCheckInRepository;
import br.unir.engagement.repository.SportsMatchRepository;
import br.unir.engagement.repository.SportsTeamMemberRepository;
import br.unir.engagement.repository.SportsTeamRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SportsParticipationService {

    private static final Set<String> ALLOWED_SPORTS_ORGANIZERS = Set.of("UNIVERSITY", "ACADEMIC_UNIT", "DEPARTMENT",
            "ACADEMIC_ENTITY", "PROFESSOR");
    private static final Set<String> ALLOWED_SKILL_LEVELS = Set.of("COMPETITIVE", "RECREATIONAL");
    private static final Set<String> ALLOWED_TIE_BREAKERS = Set.of("SCORE_DIFFERENCE", "WINS", "HEAD_TO_HEAD");
    private static final String CONTEXT_COMPETITION = "COMPETITION";
    private static final String CONTEXT_SEASON = "SEASON";
    private static final String STATUS_PENDING_PAYMENT = "PENDING_PAYMENT";
    private static final String STATUS_CONFIRMED = "CONFIRMED";
    private static final String STATUS_QUEUED = "QUEUED";
    private static final String STATUS_ALLOCATED = "ALLOCATED";
    private static final String STATUS_SCHEDULED = "SCHEDULED";
    private static final Duration SPORTS_PAYMENT_WINDOW = Duration.ofMinutes(15);
    private static final Duration SPORTS_RESERVATION_WINDOW = Duration.ofMinutes(20);
    private static final String DEFAULT_LOCATION = "Ginásio Poliesportivo UFLA";

    private final SportRepository sportRepository;
    private final CompetitionRepository competitionRepository;
    private final SeasonRepository seasonRepository;
    private final SportsTeamRepository teamRepository;
    private final SportsTeamMemberRepository teamMemberRepository;
    private final SportsFreeAgentRepository freeAgentRepository;
    private final SportsMatchRepository matchRepository;
    private final SportsMatchCheckInRepository checkInRepository;
    private final CampusEventOrganizerClient campusOrganizerClient;
    private final OutboxRepository outboxRepository;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public SportsParticipationService(SportRepository sportRepository, CompetitionRepository competitionRepository,
            SeasonRepository seasonRepository, SportsTeamRepository teamRepository,
            SportsTeamMemberRepository teamMemberRepository, SportsFreeAgentRepository freeAgentRepository,
            SportsMatchRepository matchRepository, SportsMatchCheckInRepository checkInRepository,
            CampusEventOrganizerClient campusOrganizerClient, OutboxRepository outboxRepository,
            ObjectMapper objectMapper) {
        this(sportRepository, competitionRepository, seasonRepository, teamRepository, teamMemberRepository,
                freeAgentRepository, matchRepository, checkInRepository, campusOrganizerClient, outboxRepository,
                objectMapper, Clock.systemUTC());
    }

    SportsParticipationService(SportRepository sportRepository, CompetitionRepository competitionRepository,
            SeasonRepository seasonRepository, SportsTeamRepository teamRepository,
            SportsTeamMemberRepository teamMemberRepository, SportsFreeAgentRepository freeAgentRepository,
            SportsMatchRepository matchRepository, SportsMatchCheckInRepository checkInRepository,
            CampusEventOrganizerClient campusOrganizerClient, OutboxRepository outboxRepository,
            ObjectMapper objectMapper, Clock clock) {
        this.sportRepository = sportRepository;
        this.competitionRepository = competitionRepository;
        this.seasonRepository = seasonRepository;
        this.teamRepository = teamRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.freeAgentRepository = freeAgentRepository;
        this.matchRepository = matchRepository;
        this.checkInRepository = checkInRepository;
        this.campusOrganizerClient = campusOrganizerClient;
        this.outboxRepository = outboxRepository;
        this.objectMapper = objectMapper.copy();
        this.clock = clock;
    }

    public EventOrganizerContextsResponse getOrganizerContexts(String bearerToken) {
        List<EventOrganizerContext> allowed = this.campusOrganizerClient.getContexts(bearerToken).items().stream()
                .filter(context -> ALLOWED_SPORTS_ORGANIZERS.contains(normalizeUpper(context.organizerType())))
                .toList();
        return new EventOrganizerContextsResponse(allowed);
    }

    @Transactional
    public SportResponse createSport(CreateSportRequest request, String bearerToken) {
        if (request == null) {
            throw badRequest("Request body is required");
        }
        String name = requireNonBlank(request.name(), "name", 160);
        int playersOnField = requirePositive(request.playersOnField(), "playersOnField");
        int minimumRoster = requirePositive(request.minimumRoster(), "minimumRoster");
        int maximumRoster = requirePositive(request.maximumRoster(), "maximumRoster");
        if (minimumRoster < playersOnField || maximumRoster < minimumRoster) {
            throw badRequest("minimumRoster must be >= playersOnField and <= maximumRoster");
        }
        boolean allowsDraw = request.allowsDraw() == null || request.allowsDraw();
        int winPoints = request.winPoints() == null ? 3 : request.winPoints();
        int drawPoints = request.drawPoints() == null ? (allowsDraw ? 1 : 0) : request.drawPoints();
        int lossPoints = request.lossPoints() == null ? 0 : request.lossPoints();
        int defaultForfeitScore = request.defaultForfeitScore() == null ? 3 : request.defaultForfeitScore();
        if (winPoints < 0 || drawPoints < 0 || lossPoints < 0 || defaultForfeitScore < 0) {
            throw badRequest("Points and forfeit score must be non-negative");
        }
        String rulesMarkdown = requireNonBlank(request.rulesMarkdown(), "rulesMarkdown", 8000);
        EventOrganizerContext organizer = requireAuthorizedOrganizer(request.createdByType(), request.createdById(),
                bearerToken);

        Sport sport = new Sport(UUID.randomUUID(), name, playersOnField, minimumRoster, maximumRoster, allowsDraw,
                winPoints, drawPoints, lossPoints, defaultForfeitScore, rulesMarkdown, organizer.organizerType(),
                organizer.organizerId(), "ACTIVE");
        return SportResponse.from(this.sportRepository.save(sport));
    }

    @Transactional
    public CompetitionResponse createCompetition(CreateCompetitionRequest request, String bearerToken) {
        if (request == null) {
            throw badRequest("Request body is required");
        }
        String title = requireNonBlank(request.title(), "title", 200);
        Sport sport = findSport(request.sportId());
        String skillLevel = validateSkillLevel(request.skillLevel());
        EventOrganizerContext organizer = requireAuthorizedOrganizer(request.organizerType(), request.organizerId(),
                bearerToken);
        int targetTeamCount = request.targetTeamCount() == null ? 16 : request.targetTeamCount();
        if (targetTeamCount != 16 && targetTeamCount != 32) {
            throw badRequest("targetTeamCount must be 16 or 32 for competitions");
        }
        int rosterMin = request.rosterMin() == null ? sport.getMinimumRoster() : request.rosterMin();
        int rosterMax = request.rosterMax() == null ? sport.getMaximumRoster() : request.rosterMax();
        validateRosterRange(rosterMin, rosterMax);
        String[] tieBreakers = validateTieBreakers(request.tieBreakers());
        long teamPrice = validatePrice(request.teamEntryPrice(), "teamEntryPrice");
        long freeAgentPrice = validatePrice(request.freeAgentPrice(), "freeAgentPrice");
        Instant deadline = requireDeadline(request.registrationDeadline());

        Competition competition = new Competition(UUID.randomUUID(), title, sport, skillLevel,
                organizer.organizerType(), organizer.organizerId(), new UUID[0], targetTeamCount, rosterMin, rosterMax,
                tieBreakers, teamPrice, freeAgentPrice, deadline, null, "OPEN", "GROUPS_KNOCKOUT");
        return CompetitionResponse.from(this.competitionRepository.save(competition));
    }

    @Transactional
    public SeasonResponse createSeason(CreateSeasonRequest request, String bearerToken) {
        if (request == null) {
            throw badRequest("Request body is required");
        }
        String title = requireNonBlank(request.title(), "title", 200);
        Sport sport = findSport(request.sportId());
        String skillLevel = validateSkillLevel(request.skillLevel());
        EventOrganizerContext organizer = requireAuthorizedOrganizer(request.organizerType(), request.organizerId(),
                bearerToken);
        int targetTeamCount = request.targetTeamCount() == null ? 10 : request.targetTeamCount();
        if (targetTeamCount != 10 && targetTeamCount != 20) {
            throw badRequest("targetTeamCount must be 10 or 20 for seasons");
        }
        String roundRobinMode = targetTeamCount == 10 ? "double round-robin" : "single round-robin";
        int rosterMin = request.rosterMin() == null ? sport.getMinimumRoster() : request.rosterMin();
        int rosterMax = request.rosterMax() == null ? sport.getMaximumRoster() : request.rosterMax();
        validateRosterRange(rosterMin, rosterMax);
        String[] tieBreakers = validateTieBreakers(request.tieBreakers());
        long teamPrice = validatePrice(request.teamEntryPrice(), "teamEntryPrice");
        long freeAgentPrice = validatePrice(request.freeAgentPrice(), "freeAgentPrice");
        Instant deadline = requireDeadline(request.registrationDeadline());

        Season season = new Season(UUID.randomUUID(), title, sport, skillLevel, organizer.organizerType(),
                organizer.organizerId(), new UUID[0], targetTeamCount, rosterMin, rosterMax, tieBreakers, teamPrice,
                freeAgentPrice, deadline, "OPEN", roundRobinMode);
        return SeasonResponse.from(this.seasonRepository.save(season));
    }

    @Transactional
    public SportsEventOverviewResponse getOverview(String rawContextType, UUID contextId, String userId,
            String bearerToken) {
        EventMeta meta = resolveEventMeta(rawContextType, contextId);
        expirePendingSportsPayments(meta.contextType(), contextId);
        List<SportsTeam> teams = this.teamRepository.findByContextTypeAndContextIdAndStatusOrderByCreatedAtAsc(
                meta.contextType(), contextId, STATUS_CONFIRMED);
        List<UUID> teamIds = teams.stream().map(SportsTeam::getId).toList();
        Map<UUID, List<SportsTeamMemberResponse>> membersByTeam = loadMembersByTeam(teamIds);
        Map<UUID, String> teamNames = teams.stream().collect(Collectors.toMap(SportsTeam::getId, SportsTeam::getName));

        UUID viewerTeamId = findViewerTeamId(teams, membersByTeam, userId);
        boolean viewerCanManage = canManageSilently(meta.organizerType(), meta.organizerId(), bearerToken);

        List<SportsTeamResponse> teamResponses = teams.stream()
                .map(team -> SportsTeamResponse.from(team, membersByTeam.getOrDefault(team.getId(), List.of())))
                .toList();

        List<SportsFreeAgent> queuedFreeAgents = this.freeAgentRepository
                .findByContextTypeAndContextIdAndStatusOrderByRegisteredAtAsc(meta.contextType(), contextId,
                        STATUS_QUEUED);
        boolean viewerFreeAgentQueued = queuedFreeAgents.stream().anyMatch(fa -> userId.equals(fa.getUserId()));
        List<SportsFreeAgentResponse> freeAgentResponses = queuedFreeAgents.stream().map(SportsFreeAgentResponse::from)
                .toList();

        List<SportsMatch> matches = this.matchRepository
                .findByContextTypeAndContextIdOrderByRoundNumberAscScheduledAtAsc(meta.contextType(), contextId);
        List<SportsMatchResponse> matchResponses = toMatchResponses(matches, teamNames, userId, viewerCanManage);

        boolean viewerPendingTeam = this.teamRepository
                .findByContextTypeAndContextIdAndStatusOrderByCreatedAtAsc(meta.contextType(), contextId,
                        STATUS_PENDING_PAYMENT)
                .stream().anyMatch(team -> userId.equals(team.getCaptainUserId()));
        boolean viewerPendingFreeAgent = this.freeAgentRepository.existsByContextTypeAndContextIdAndUserIdAndStatus(
                meta.contextType(), contextId, userId, STATUS_PENDING_PAYMENT);

        return new SportsEventOverviewResponse(meta.contextType(), contextId, meta.title(), meta.skillLevel(),
                meta.organizerType(), meta.organizerId(), meta.targetTeamCount(), meta.rosterMin(), meta.rosterMax(),
                meta.teamEntryPrice(), meta.freeAgentPrice(), meta.registrationDeadline(), meta.formatOrMode(),
                meta.tieBreakers(), meta.status(), SportResponse.from(meta.sport()), teamResponses, freeAgentResponses,
                matchResponses, viewerCanManage, viewerTeamId, viewerFreeAgentQueued,
                viewerPendingTeam || viewerPendingFreeAgent);
    }

    @Transactional
    public SportsTeamResponse registerTeam(String rawContextType, UUID contextId, CreateSportsTeamRequest request,
            String userId, String defaultDisplayName) {
        if (request == null) {
            throw badRequest("Request body is required");
        }
        EventMeta meta = resolveEventMeta(rawContextType, contextId);
        expirePendingSportsPayments(meta.contextType(), contextId);
        String teamName = requireNonBlank(request.name(), "name", 120);
        String captainName = normalizeDisplayName(request.captainName(), defaultDisplayName, userId);

        List<SportsTeam> activeTeams = this.teamRepository.findByContextTypeAndContextIdAndStatusInOrderByCreatedAtAsc(
                meta.contextType(), contextId, List.of(STATUS_CONFIRMED, STATUS_PENDING_PAYMENT));
        if (activeTeams.size() >= meta.targetTeamCount()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Maximum team capacity reached");
        }
        ensureUserNotAlreadyEnrolled(meta.contextType(), contextId, activeTeams, userId);

        List<String> extraMembers = request.memberNames().stream().map(value -> value == null ? "" : value.trim())
                .filter(value -> !value.isEmpty()).toList();
        if (1 + extraMembers.size() > meta.rosterMax()) {
            throw badRequest("Team exceeds maximum roster size of " + meta.rosterMax());
        }

        Instant now = Instant.now(this.clock).truncatedTo(ChronoUnit.MICROS);
        boolean requiresPayment = meta.teamEntryPrice() > 0L;
        String initialStatus = requiresPayment ? STATUS_PENDING_PAYMENT : STATUS_CONFIRMED;
        Instant paymentDeadlineAt = requiresPayment ? now.plus(SPORTS_PAYMENT_WINDOW) : null;
        Instant reservationExpiresAt = requiresPayment ? now.plus(SPORTS_RESERVATION_WINDOW) : null;
        SportsTeam team = this.teamRepository
                .save(new SportsTeam(UUID.randomUUID(), meta.contextType(), contextId, teamName, userId, initialStatus,
                        now, requiresPayment ? meta.teamEntryPrice() : null, paymentDeadlineAt, reservationExpiresAt));
        List<SportsTeamMember> savedMembers = new ArrayList<>();
        savedMembers.add(this.teamMemberRepository
                .save(new SportsTeamMember(UUID.randomUUID(), team.getId(), userId, captainName, "CAPTAIN", now)));
        for (String memberName : extraMembers) {
            savedMembers.add(this.teamMemberRepository.save(new SportsTeamMember(UUID.randomUUID(), team.getId(), null,
                    truncate(memberName, 160), "MEMBER", now)));
        }

        if (requiresPayment) {
            enqueueSportsPaymentRequest(team.getId(), contextId, userId, meta.teamEntryPrice(), paymentDeadlineAt,
                    reservationExpiresAt, now);
        }

        return SportsTeamResponse.from(team, savedMembers.stream().map(SportsTeamMemberResponse::from).toList());
    }

    @Transactional
    public SportsFreeAgentRegistrationResponse registerFreeAgent(String rawContextType, UUID contextId,
            RegisterFreeAgentRequest request, String userId, String defaultDisplayName) {
        EventMeta meta = resolveEventMeta(rawContextType, contextId);
        expirePendingSportsPayments(meta.contextType(), contextId);
        String displayName = normalizeDisplayName(request == null ? null : request.displayName(), defaultDisplayName,
                userId);

        List<SportsTeam> activeTeams = this.teamRepository.findByContextTypeAndContextIdAndStatusInOrderByCreatedAtAsc(
                meta.contextType(), contextId, List.of(STATUS_CONFIRMED, STATUS_PENDING_PAYMENT));
        ensureUserNotAlreadyEnrolled(meta.contextType(), contextId, activeTeams, userId);

        Instant now = Instant.now(this.clock).truncatedTo(ChronoUnit.MICROS);
        if (meta.freeAgentPrice() > 0L) {
            Instant paymentDeadlineAt = now.plus(SPORTS_PAYMENT_WINDOW);
            Instant reservationExpiresAt = now.plus(SPORTS_RESERVATION_WINDOW);
            SportsFreeAgent pending = this.freeAgentRepository.save(new SportsFreeAgent(UUID.randomUUID(),
                    meta.contextType(), contextId, userId, displayName, null, STATUS_PENDING_PAYMENT, now,
                    meta.freeAgentPrice(), paymentDeadlineAt, reservationExpiresAt));
            enqueueSportsPaymentRequest(pending.getId(), contextId, userId, meta.freeAgentPrice(), paymentDeadlineAt,
                    reservationExpiresAt, now);
            return new SportsFreeAgentRegistrationResponse(STATUS_PENDING_PAYMENT, null, null);
        }

        SportsFreeAgent freeAgent = this.freeAgentRepository.save(new SportsFreeAgent(UUID.randomUUID(),
                meta.contextType(), contextId, userId, displayName, null, STATUS_QUEUED, now));
        return allocateOrQueueFreeAgent(meta, freeAgent, now);
    }

    @Transactional
    public String confirmSportsPayment(UUID referenceId, UUID eventId, String userId, long amountMinor,
            Instant paidAt) {
        SportsTeam team = this.teamRepository.findById(referenceId).orElse(null);
        if (team != null) {
            String reason = sportsPaymentCompensationReason(eventId, team.getContextId(), userId,
                    team.getCaptainUserId(), amountMinor, team.getPaymentAmountMinor(), paidAt, team.getCreatedAt(),
                    team.getPaymentDeadlineAt(), team.getReservationExpiresAt(), team.getStatus());
            if (reason != null) {
                if (isExpiredPaymentReason(reason)) {
                    team.cancelPayment();
                    this.teamRepository.saveAndFlush(team);
                }
                return reason;
            }
            if (STATUS_PENDING_PAYMENT.equals(team.getStatus())) {
                team.confirmPayment();
                this.teamRepository.saveAndFlush(team);
            }
            return null;
        }
        SportsFreeAgent freeAgent = this.freeAgentRepository.findById(referenceId).orElse(null);
        if (freeAgent != null) {
            String reason = sportsPaymentCompensationReason(eventId, freeAgent.getContextId(), userId,
                    freeAgent.getUserId(), amountMinor, freeAgent.getPaymentAmountMinor(), paidAt,
                    freeAgent.getRegisteredAt(), freeAgent.getPaymentDeadlineAt(), freeAgent.getReservationExpiresAt(),
                    freeAgent.getStatus());
            if (reason != null) {
                if (isExpiredPaymentReason(reason)) {
                    freeAgent.cancelPayment();
                    this.freeAgentRepository.saveAndFlush(freeAgent);
                }
                return reason;
            }
            if (STATUS_PENDING_PAYMENT.equals(freeAgent.getStatus())) {
                freeAgent.markQueued();
                this.freeAgentRepository.saveAndFlush(freeAgent);
                EventMeta meta = resolveEventMeta(freeAgent.getContextType(), freeAgent.getContextId());
                allocateOrQueueFreeAgent(meta, freeAgent, Instant.now(this.clock).truncatedTo(ChronoUnit.MICROS));
            }
            return null;
        }
        return "REGISTRATION_NOT_FOUND";
    }

    @Transactional(readOnly = true)
    public MySportsEnrollmentsResponse getMyEnrollments(String userId) {
        Map<String, MySportsEnrollmentResponse> byEvent = new LinkedHashMap<>();

        List<SportsTeamMember> memberships = this.teamMemberRepository.findByUserId(userId);
        if (!memberships.isEmpty()) {
            Set<UUID> teamIds = memberships.stream().map(SportsTeamMember::getTeamId).collect(Collectors.toSet());
            for (SportsTeam team : this.teamRepository.findByIdIn(teamIds)) {
                if (!STATUS_CONFIRMED.equals(team.getStatus())) {
                    continue;
                }
                String key = team.getContextType() + ":" + team.getContextId();
                EventMeta meta = resolveEventMeta(team.getContextType(), team.getContextId());
                byEvent.put(key,
                        new MySportsEnrollmentResponse(meta.contextType(), meta.contextId(), meta.title(),
                                meta.sport().getName(), meta.skillLevel(), "TEAM", team.getName(),
                                meta.registrationDeadline()));
            }
        }

        for (SportsFreeAgent queued : this.freeAgentRepository.findByUserIdAndStatusOrderByRegisteredAtDesc(userId,
                STATUS_QUEUED)) {
            String key = queued.getContextType() + ":" + queued.getContextId();
            if (!byEvent.containsKey(key)) {
                EventMeta meta = resolveEventMeta(queued.getContextType(), queued.getContextId());
                byEvent.put(key,
                        new MySportsEnrollmentResponse(meta.contextType(), meta.contextId(), meta.title(),
                                meta.sport().getName(), meta.skillLevel(), "FREE_AGENT_QUEUED", null,
                                meta.registrationDeadline()));
            }
        }

        return new MySportsEnrollmentsResponse(List.copyOf(byEvent.values()));
    }

    private SportsFreeAgentRegistrationResponse allocateOrQueueFreeAgent(EventMeta meta, SportsFreeAgent freeAgent,
            Instant now) {
        List<SportsTeam> confirmedTeams = this.teamRepository.findByContextTypeAndContextIdAndStatusOrderByCreatedAtAsc(
                meta.contextType(), meta.contextId(), STATUS_CONFIRMED);
        List<UUID> teamIds = confirmedTeams.stream().map(SportsTeam::getId).toList();
        Map<UUID, List<SportsTeamMemberResponse>> membersByTeam = loadMembersByTeam(teamIds);

        SportsTeam targetTeam = confirmedTeams.stream()
                .filter(team -> membersByTeam.getOrDefault(team.getId(), List.of()).size() < meta.rosterMax())
                .min(Comparator
                        .<SportsTeam>comparingInt(team -> membersByTeam.getOrDefault(team.getId(), List.of()).size())
                        .thenComparing(SportsTeam::getCreatedAt))
                .orElse(null);

        if (targetTeam != null) {
            this.teamMemberRepository.save(new SportsTeamMember(UUID.randomUUID(), targetTeam.getId(),
                    freeAgent.getUserId(), freeAgent.getDisplayName(), "FREE_AGENT", now));
            freeAgent.allocateToTeam(targetTeam.getId());
            this.freeAgentRepository.save(freeAgent);
            return new SportsFreeAgentRegistrationResponse(STATUS_ALLOCATED, targetTeam.getId(), targetTeam.getName());
        }

        List<SportsFreeAgent> queue = this.freeAgentRepository
                .findByContextTypeAndContextIdAndStatusOrderByRegisteredAtAsc(meta.contextType(), meta.contextId(),
                        STATUS_QUEUED);
        if (queue.size() >= meta.rosterMin() && confirmedTeams.size() < meta.targetTeamCount()) {
            List<SportsFreeAgent> batch = queue.subList(0, meta.rosterMin());
            SportsFreeAgent captain = batch.get(0);
            String autoTeamName = "Equipe Free Agents #" + (confirmedTeams.size() + 1);
            SportsTeam newTeam = this.teamRepository.save(new SportsTeam(UUID.randomUUID(), meta.contextType(),
                    meta.contextId(), autoTeamName, captain.getUserId(), STATUS_CONFIRMED, now));
            for (int index = 0; index < batch.size(); index++) {
                SportsFreeAgent agent = batch.get(index);
                String role = index == 0 ? "CAPTAIN" : "FREE_AGENT";
                this.teamMemberRepository.save(new SportsTeamMember(UUID.randomUUID(), newTeam.getId(),
                        agent.getUserId(), agent.getDisplayName(), role, now));
                agent.allocateToTeam(newTeam.getId());
                this.freeAgentRepository.save(agent);
            }
            if (batch.stream().anyMatch(agent -> agent.getId().equals(freeAgent.getId()))) {
                return new SportsFreeAgentRegistrationResponse(STATUS_ALLOCATED, newTeam.getId(), newTeam.getName());
            }
        }

        return new SportsFreeAgentRegistrationResponse(STATUS_QUEUED, null, null);
    }

    private void enqueueSportsPaymentRequest(UUID referenceId, UUID contextId, String userId, long amountMinor,
            Instant paymentDeadlineAt, Instant reservationExpiresAt, Instant now) {
        RegistrationPaymentRequestedPayload payload = new RegistrationPaymentRequestedPayload(referenceId, contextId,
                userId, amountMinor, RegistrationPaymentRequestedPayload.CURRENCY, paymentDeadlineAt,
                reservationExpiresAt);
        try {
            String payloadJson = this.objectMapper.writeValueAsString(payload);
            this.outboxRepository.saveAndFlush(new OutboxEvent(UUID.randomUUID(), "Registration", referenceId,
                    RegistrationPaymentRequestedPayload.EVENT_TYPE, payloadJson, now));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize RegistrationPaymentRequested v1 for sports",
                    exception);
        }
    }

    private void expirePendingSportsPayments(String contextType, UUID contextId) {
        Instant now = Instant.now(this.clock);
        List<SportsTeam> pendingTeams = this.teamRepository.findByContextTypeAndContextIdAndStatusOrderByCreatedAtAsc(
                contextType, contextId, STATUS_PENDING_PAYMENT);
        for (SportsTeam team : pendingTeams) {
            Instant reservationExpiresAt = team.getReservationExpiresAt() == null
                    ? team.getCreatedAt().plus(SPORTS_RESERVATION_WINDOW)
                    : team.getReservationExpiresAt();
            if (!now.isBefore(reservationExpiresAt)) {
                team.cancelPayment();
                this.teamRepository.save(team);
            }
        }

        List<SportsFreeAgent> pendingFreeAgents = this.freeAgentRepository
                .findByContextTypeAndContextIdAndStatusOrderByRegisteredAtAsc(contextType, contextId,
                        STATUS_PENDING_PAYMENT);
        for (SportsFreeAgent freeAgent : pendingFreeAgents) {
            Instant reservationExpiresAt = freeAgent.getReservationExpiresAt() == null
                    ? freeAgent.getRegisteredAt().plus(SPORTS_RESERVATION_WINDOW)
                    : freeAgent.getReservationExpiresAt();
            if (!now.isBefore(reservationExpiresAt)) {
                freeAgent.cancelPayment();
                this.freeAgentRepository.save(freeAgent);
            }
        }
    }

    private String sportsPaymentCompensationReason(UUID expectedEventId, UUID actualContextId, String expectedUserId,
            String actualUserId, long paidAmountMinor, Long expectedAmountMinor, Instant paidAt, Instant createdAt,
            Instant paymentDeadlineAt, Instant reservationExpiresAt, String status) {
        if (!expectedUserId.equals(actualUserId)) {
            return "USER_ID_MISMATCH";
        }
        if (!expectedEventId.equals(actualContextId)) {
            return "EVENT_ID_MISMATCH";
        }
        if (expectedAmountMinor == null || paidAmountMinor != expectedAmountMinor) {
            return "AMOUNT_MISMATCH";
        }
        if (STATUS_CONFIRMED.equals(status)) {
            return null;
        }
        if (!STATUS_PENDING_PAYMENT.equals(status)) {
            return "REGISTRATION_" + status;
        }
        if (paymentDeadlineAt == null || reservationExpiresAt == null) {
            return "INVALID_PAYMENT_DEADLINES";
        }
        if (paidAt == null || paidAt.isBefore(createdAt)) {
            return "PAYMENT_BEFORE_REGISTRATION";
        }
        if (paidAt.isAfter(paymentDeadlineAt)) {
            return "PAYMENT_AFTER_DEADLINE";
        }
        if (!Instant.now(this.clock).isBefore(reservationExpiresAt)) {
            return "RESERVATION_EXPIRED";
        }
        return null;
    }

    private static boolean isExpiredPaymentReason(String reason) {
        return "PAYMENT_AFTER_DEADLINE".equals(reason) || "RESERVATION_EXPIRED".equals(reason);
    }

    @Transactional
    public List<SportsMatchResponse> generateMatches(String rawContextType, UUID contextId,
            GenerateSportsMatchesRequest request, String userId, String bearerToken) {
        EventMeta meta = resolveEventMeta(rawContextType, contextId);
        requireAuthorizedOrganizer(meta.organizerType(), meta.organizerId(), bearerToken);

        if (this.matchRepository.existsByContextTypeAndContextId(meta.contextType(), contextId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Matches have already been generated");
        }
        List<SportsTeam> teams = this.teamRepository.findByContextTypeAndContextIdAndStatusOrderByCreatedAtAsc(
                meta.contextType(), contextId, STATUS_CONFIRMED);
        if (teams.size() < 2) {
            throw badRequest("At least 2 confirmed teams are required to generate matches");
        }

        Instant start = request != null && request.firstMatchAt() != null
                ? request.firstMatchAt()
                : Instant.now().plus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.HOURS);
        String location = request != null && request.location() != null && !request.location().isBlank()
                ? truncate(request.location().trim(), 200)
                : DEFAULT_LOCATION;

        Instant now = Instant.now();
        List<SportsMatch> generated = new ArrayList<>();
        int matchIndex = 0;
        for (int i = 0; i < teams.size(); i++) {
            for (int j = i + 1; j < teams.size(); j++) {
                int roundNumber = matchIndex + 1;
                Instant scheduledAt = start.plus(matchIndex * 2L, ChronoUnit.HOURS);
                generated.add(new SportsMatch(UUID.randomUUID(), meta.contextType(), contextId, roundNumber,
                        teams.get(i).getId(), teams.get(j).getId(), scheduledAt, location, null, null, STATUS_SCHEDULED,
                        null, now));
                matchIndex++;
            }
        }
        List<SportsMatch> saved = this.matchRepository.saveAll(generated);
        Map<UUID, String> teamNames = teams.stream().collect(Collectors.toMap(SportsTeam::getId, SportsTeam::getName));
        return toMatchResponses(saved, teamNames, userId, true);
    }

    @Transactional
    public SportsMatchResponse recordScore(UUID matchId, RecordSportsMatchScoreRequest request, String userId,
            String bearerToken) {
        if (request == null || request.homeScore() == null || request.awayScore() == null) {
            throw badRequest("homeScore and awayScore are required");
        }
        if (request.homeScore() < 0 || request.awayScore() < 0) {
            throw badRequest("Scores must be non-negative");
        }
        SportsMatch match = findMatch(matchId);
        EventMeta meta = resolveEventMeta(match.getContextType(), match.getContextId());
        requireAuthorizedOrganizer(meta.organizerType(), meta.organizerId(), bearerToken);

        match.recordScore(request.homeScore(), request.awayScore());
        SportsMatch saved = this.matchRepository.save(match);
        Map<UUID, String> teamNames = loadTeamNames(List.of(saved.getHomeTeamId(), saved.getAwayTeamId()));
        return toMatchResponses(List.of(saved), teamNames, userId, true).get(0);
    }

    @Transactional
    public SportsMatchCheckInTokenResponse generateCheckInToken(UUID matchId, String bearerToken) {
        SportsMatch match = findMatch(matchId);
        EventMeta meta = resolveEventMeta(match.getContextType(), match.getContextId());
        requireAuthorizedOrganizer(meta.organizerType(), meta.organizerId(), bearerToken);

        String token = "UNIR-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);
        match.updateCheckinToken(token);
        this.matchRepository.save(match);
        return new SportsMatchCheckInTokenResponse(match.getId(), token);
    }

    @Transactional
    public SportsMatchCheckInResponse checkIn(UUID matchId, SportsMatchCheckInRequest request, String userId) {
        if (request == null || request.token() == null || request.token().isBlank()) {
            throw badRequest("Check-in token is required");
        }
        SportsMatch match = findMatch(matchId);
        if (match.getCheckinToken() == null || match.getCheckinToken().isBlank()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Check-in is not open for this match");
        }
        if (!match.getCheckinToken().equalsIgnoreCase(request.token().trim())) {
            throw badRequest("Invalid check-in token");
        }
        UUID playerTeamId = null;
        if (this.teamMemberRepository.existsByTeamIdAndUserId(match.getHomeTeamId(), userId)) {
            playerTeamId = match.getHomeTeamId();
        } else if (this.teamMemberRepository.existsByTeamIdAndUserId(match.getAwayTeamId(), userId)) {
            playerTeamId = match.getAwayTeamId();
        }
        if (playerTeamId == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only players enrolled in one of the match teams can check in");
        }
        if (this.checkInRepository.existsByMatchIdAndUserId(matchId, userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Check-in already recorded for this match");
        }
        SportsMatchCheckIn saved = this.checkInRepository
                .save(new SportsMatchCheckIn(UUID.randomUUID(), matchId, userId, playerTeamId, Instant.now()));
        return new SportsMatchCheckInResponse(saved.getId(), saved.getMatchId(), saved.getTeamId(), saved.getUserId(),
                saved.getCheckedInAt());
    }

    @Transactional(readOnly = true)
    public MySportsMatchesResponse getMyMatches(String userId) {
        List<SportsTeamMember> memberships = this.teamMemberRepository.findByUserId(userId);
        if (memberships.isEmpty()) {
            return new MySportsMatchesResponse(List.of());
        }
        Set<UUID> myTeamIds = memberships.stream().map(SportsTeamMember::getTeamId).collect(Collectors.toSet());
        List<SportsMatch> matches = this.matchRepository.findByTeamIds(myTeamIds);
        if (matches.isEmpty()) {
            return new MySportsMatchesResponse(List.of());
        }

        Set<UUID> allTeamIds = matches.stream().flatMap(m -> List.of(m.getHomeTeamId(), m.getAwayTeamId()).stream())
                .collect(Collectors.toSet());
        Map<UUID, String> teamNames = loadTeamNames(allTeamIds);

        List<UUID> matchIds = matches.stream().map(SportsMatch::getId).toList();
        Set<UUID> checkedInMatchIds = this.checkInRepository.findByMatchIdIn(matchIds).stream()
                .filter(ci -> userId.equals(ci.getUserId())).map(SportsMatchCheckIn::getMatchId)
                .collect(Collectors.toSet());

        Map<String, EventMeta> metaCache = new HashMap<>();
        List<MySportsMatchResponse> items = new ArrayList<>();
        for (SportsMatch match : matches) {
            String key = match.getContextType() + ":" + match.getContextId();
            EventMeta meta = metaCache.computeIfAbsent(key,
                    ignored -> resolveEventMeta(match.getContextType(), match.getContextId()));
            boolean isHome = myTeamIds.contains(match.getHomeTeamId());
            UUID teamId = isHome ? match.getHomeTeamId() : match.getAwayTeamId();
            UUID opponentId = isHome ? match.getAwayTeamId() : match.getHomeTeamId();
            items.add(new MySportsMatchResponse(match.getId(), match.getContextType(), match.getContextId(),
                    meta.title(), meta.sport().getName(), match.getRoundNumber(), teamId,
                    teamNames.getOrDefault(teamId, "Minha equipe"), teamNames.getOrDefault(opponentId, "Adversário"),
                    match.getScheduledAt(), match.getLocation(), match.getHomeScore(), match.getAwayScore(),
                    match.getStatus(), match.getCheckinToken() != null && !match.getCheckinToken().isBlank(),
                    checkedInMatchIds.contains(match.getId())));
        }
        return new MySportsMatchesResponse(items);
    }

    private void ensureUserNotAlreadyEnrolled(String contextType, UUID contextId, List<SportsTeam> teams,
            String userId) {
        if (!teams.isEmpty()) {
            List<UUID> teamIds = teams.stream().map(SportsTeam::getId).toList();
            boolean inTeam = this.teamMemberRepository.findByTeamIdInOrderByJoinedAtAsc(teamIds).stream()
                    .anyMatch(member -> userId.equals(member.getUserId()));
            if (inTeam) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "User is already enrolled in a team for this event");
            }
        }
        if (this.freeAgentRepository.existsByContextTypeAndContextIdAndUserIdAndStatus(contextType, contextId, userId,
                STATUS_QUEUED)
                || this.freeAgentRepository.existsByContextTypeAndContextIdAndUserIdAndStatus(contextType, contextId,
                        userId, STATUS_PENDING_PAYMENT)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "User is already registered as a free agent");
        }
    }

    private Map<UUID, List<SportsTeamMemberResponse>> loadMembersByTeam(List<UUID> teamIds) {
        if (teamIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, List<SportsTeamMemberResponse>> byTeam = new HashMap<>();
        for (SportsTeamMember member : this.teamMemberRepository.findByTeamIdInOrderByJoinedAtAsc(teamIds)) {
            byTeam.computeIfAbsent(member.getTeamId(), ignored -> new ArrayList<>())
                    .add(SportsTeamMemberResponse.from(member));
        }
        return byTeam;
    }

    private Map<UUID, String> loadTeamNames(java.util.Collection<UUID> teamIds) {
        return this.teamRepository.findByIdIn(teamIds).stream()
                .collect(Collectors.toMap(SportsTeam::getId, SportsTeam::getName));
    }

    private List<SportsMatchResponse> toMatchResponses(List<SportsMatch> matches, Map<UUID, String> teamNames,
            String userId, boolean includeToken) {
        if (matches.isEmpty()) {
            return List.of();
        }
        List<UUID> matchIds = matches.stream().map(SportsMatch::getId).toList();
        List<SportsMatchCheckIn> checkIns = this.checkInRepository.findByMatchIdIn(matchIds);
        Map<UUID, Integer> counts = new HashMap<>();
        Map<UUID, Boolean> viewerChecked = new HashMap<>();
        for (SportsMatchCheckIn checkIn : checkIns) {
            counts.merge(checkIn.getMatchId(), 1, Integer::sum);
            if (userId.equals(checkIn.getUserId())) {
                viewerChecked.put(checkIn.getMatchId(), true);
            }
        }
        return matches.stream().map(match -> {
            boolean hasToken = match.getCheckinToken() != null && !match.getCheckinToken().isBlank();
            return new SportsMatchResponse(match.getId(), match.getRoundNumber(), match.getHomeTeamId(),
                    teamNames.getOrDefault(match.getHomeTeamId(), "Mandante"), match.getAwayTeamId(),
                    teamNames.getOrDefault(match.getAwayTeamId(), "Visitante"), match.getScheduledAt(),
                    match.getLocation(), match.getHomeScore(), match.getAwayScore(), match.getStatus(),
                    counts.getOrDefault(match.getId(), 0), viewerChecked.getOrDefault(match.getId(), false), hasToken,
                    includeToken ? match.getCheckinToken() : null);
        }).toList();
    }

    private UUID findViewerTeamId(List<SportsTeam> teams, Map<UUID, List<SportsTeamMemberResponse>> membersByTeam,
            String userId) {
        for (SportsTeam team : teams) {
            List<SportsTeamMemberResponse> members = membersByTeam.getOrDefault(team.getId(), List.of());
            if (members.stream().anyMatch(member -> userId.equals(member.userId()))) {
                return team.getId();
            }
        }
        return null;
    }

    private EventOrganizerContext requireAuthorizedOrganizer(String rawType, UUID organizerId, String bearerToken) {
        String normalizedType = normalizeUpper(rawType);
        if (normalizedType.isEmpty() || organizerId == null) {
            throw badRequest("organizerType and organizerId are required");
        }
        if (!ALLOWED_SPORTS_ORGANIZERS.contains(normalizedType)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only internal university entities or verified professors can manage sports");
        }
        List<EventOrganizerContext> contexts = this.campusOrganizerClient.getContexts(bearerToken).items();
        return contexts.stream()
                .filter(context -> normalizedType.equals(normalizeUpper(context.organizerType()))
                        && organizerId.equals(context.organizerId()))
                .findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "User is not authorized to manage sports for this organizer context"));
    }

    private boolean canManageSilently(String organizerType, UUID organizerId, String bearerToken) {
        String normalizedType = normalizeUpper(organizerType);
        if (!ALLOWED_SPORTS_ORGANIZERS.contains(normalizedType)) {
            return false;
        }
        try {
            return this.campusOrganizerClient.getContexts(bearerToken).items().stream()
                    .anyMatch(context -> normalizedType.equals(normalizeUpper(context.organizerType()))
                            && organizerId.equals(context.organizerId()));
        } catch (ResponseStatusException ignored) {
            return false;
        }
    }

    private EventMeta resolveEventMeta(String rawContextType, UUID contextId) {
        String contextType = normalizeUpper(rawContextType);
        if (CONTEXT_COMPETITION.equals(contextType)) {
            Competition c = this.competitionRepository.findById(contextId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));
            return new EventMeta(CONTEXT_COMPETITION, c.getId(), c.getTitle(), c.getSport(), c.getSkillLevel(),
                    c.getOrganizerType(), c.getOrganizerId(), c.getTargetTeamCount(), c.getRosterMin(),
                    c.getRosterMax(), c.getTeamEntryPrice(), c.getFreeAgentPrice(), c.getRegistrationDeadline(),
                    c.getFormat(), List.of(c.getTieBreakers()), c.getStatus());
        }
        if (CONTEXT_SEASON.equals(contextType)) {
            Season s = this.seasonRepository.findById(contextId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Season not found"));
            return new EventMeta(CONTEXT_SEASON, s.getId(), s.getTitle(), s.getSport(), s.getSkillLevel(),
                    s.getOrganizerType(), s.getOrganizerId(), s.getTargetTeamCount(), s.getRosterMin(),
                    s.getRosterMax(), s.getTeamEntryPrice(), s.getFreeAgentPrice(), s.getRegistrationDeadline(),
                    s.getRoundRobinMode(), List.of(s.getTieBreakers()), s.getStatus());
        }
        throw badRequest("contextType must be COMPETITION or SEASON");
    }

    private Sport findSport(UUID sportId) {
        if (sportId == null) {
            throw badRequest("sportId is required");
        }
        return this.sportRepository.findById(sportId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sport not found"));
    }

    private SportsMatch findMatch(UUID matchId) {
        return this.matchRepository.findById(matchId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Match not found"));
    }

    private static String validateSkillLevel(String raw) {
        String normalized = normalizeUpper(raw);
        if (!ALLOWED_SKILL_LEVELS.contains(normalized)) {
            throw badRequest("skillLevel must be COMPETITIVE or RECREATIONAL");
        }
        return normalized;
    }

    private static void validateRosterRange(int rosterMin, int rosterMax) {
        if (rosterMin < 1 || rosterMax < rosterMin) {
            throw badRequest("rosterMin must be >= 1 and <= rosterMax");
        }
    }

    private static String[] validateTieBreakers(List<String> raw) {
        if (raw == null || raw.isEmpty()) {
            return new String[]{"SCORE_DIFFERENCE", "WINS"};
        }
        List<String> normalized = raw.stream().map(SportsParticipationService::normalizeUpper)
                .filter(value -> !value.isEmpty()).distinct().toList();
        for (String value : normalized) {
            if (!ALLOWED_TIE_BREAKERS.contains(value)) {
                throw badRequest("Unsupported tieBreaker: " + value);
            }
        }
        return normalized.toArray(new String[0]);
    }

    private static long validatePrice(Long price, String field) {
        long value = price == null ? 0L : price;
        if (value < 0L) {
            throw badRequest(field + " must be non-negative");
        }
        return value;
    }

    private static Instant requireDeadline(Instant deadline) {
        if (deadline == null) {
            throw badRequest("registrationDeadline is required");
        }
        return deadline;
    }

    private static String requireNonBlank(String value, String field, int maxLength) {
        if (value == null || value.isBlank()) {
            throw badRequest(field + " is required");
        }
        String trimmed = value.trim();
        if (trimmed.length() > maxLength) {
            throw badRequest(field + " exceeds maximum length of " + maxLength);
        }
        return trimmed;
    }

    private static int requirePositive(Integer value, String field) {
        if (value == null || value < 1) {
            throw badRequest(field + " must be >= 1");
        }
        return value;
    }

    private static String normalizeDisplayName(String candidate, String fallback, String userId) {
        if (candidate != null && !candidate.isBlank()) {
            return truncate(candidate.trim(), 160);
        }
        if (fallback != null && !fallback.isBlank()) {
            return truncate(fallback.trim(), 160);
        }
        return truncate(userId, 160);
    }

    private static String truncate(String value, int maxLength) {
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    private static String normalizeUpper(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private record EventMeta(String contextType, UUID contextId, String title, Sport sport, String skillLevel,
            String organizerType, UUID organizerId, int targetTeamCount, int rosterMin, int rosterMax,
            long teamEntryPrice, long freeAgentPrice, Instant registrationDeadline, String formatOrMode,
            List<String> tieBreakers, String status) {
    }
}
