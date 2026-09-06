const API_BASE = 'https://events.vex.com/api/v2';
        const TEAM_NUMBER = '1239E';
        const BEARER_TOKEN = window.APP_CONFIG?.VEX_API_TOKEN || '';

        let state = {
            teamId: null,
            event: null,
            divisionId: null,
            matches: [],
            lastScoredMatch: null,
            nextMatchForTeam: null,
            remainingMatchesCount: 0,
            subsequentMatches: [],
            qualificationRank: null,
            bestQualificationRank: null,
            worstQualificationRank: null,
            skillsRank: null,
            lastUpdated: null
        };
        const apiCache = new Map();
        const API_CACHE_TTL = 5 * 60 * 1000;

        const loadingEl = document.getElementById('loading');
        const errorEl = document.getElementById('error-message');
        const appEl = document.getElementById('app');
        const remainingMatchesEl = document.getElementById('remaining-matches');
        const nextMatchIdEl = document.getElementById('next-match-id');
        const blueTeam1El = document.getElementById('blue-team1');
        const blueTeam2El = document.getElementById('blue-team2');
        const redTeam1El = document.getElementById('red-team1');
        const redTeam2El = document.getElementById('red-team2');
        const eventNameEl = document.getElementById('event-name');
        const divisionNameEl = document.getElementById('division-name');
        const lastScoredEl = document.getElementById('last-scored');
        const qualificationRankEl = document.getElementById('qualification-rank');
        const bestQualificationRankEl = document.getElementById('best-qualification-rank');
        const worstQualificationRankEl = document.getElementById('worst-qualification-rank');
        const skillsRankEl = document.getElementById('skills-rank');
        const lastRefreshedEl = document.getElementById('last-refreshed');
        const queueListEl = document.getElementById('queue-list');
        const refreshBtn = document.getElementById('refresh-btn');
        const eventInfoEl = document.getElementById('event-info');

        async function fetchWithAuth(url) {
            const nativeHttp = window.Capacitor?.Plugins?.CapacitorHttp
                || window.Capacitor?.registerPlugin?.('CapacitorHttp');
            if (nativeHttp?.request) {
                for (let attempt = 0; attempt < 4; attempt++) {
                    const result = await nativeHttp.request({
                        url,
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${BEARER_TOKEN}`,
                            'Accept': 'application/json'
                        }
                    });
                    if (result.status >= 200 && result.status < 300) return result.data;
                    if (result.status !== 429 || attempt === 3) {
                        throw new Error(`HTTP error! status: ${result.status}`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
                }
            }

            for (let attempt = 0; attempt < 4; attempt++) {
                const response = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${BEARER_TOKEN}`,
                        'Accept': 'application/json'
                    }
                });
                if (response.ok) return await response.json();
                if (response.status !== 429 || attempt === 3) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
            }
        }

        function responseItems(response) {
            return Array.isArray(response) ? response : (Array.isArray(response?.data) ? response.data : []);
        }

        async function fetchAllPages(path) {
            const cached = apiCache.get(path);
            if (cached && Date.now() - cached.timestamp < API_CACHE_TTL) {
                return cached.items;
            }
            const separator = path.includes('?') ? '&' : '?';
            const first = await fetchWithAuth(`${path}${separator}per_page=250`);
            const items = responseItems(first);
            const lastPage = Number(first?.meta?.last_page || 1);
            for (let page = 2; page <= lastPage; page++) {
                const next = await fetchWithAuth(`${path}${separator}per_page=250&page=${page}`);
                items.push(...responseItems(next));
            }
            apiCache.set(path, { items, timestamp: Date.now() });
            return items;
        }

        function calculateQualificationBounds(rankings, teamNum, futureMatchCount) {
            const current = rankings.find(r => r.team?.name === teamNum);
            if (!current) return { best: null, worst: null };

            const played = Number(current.wins || 0) + Number(current.losses || 0) + Number(current.ties || 0);
            const totalMatches = Math.max(played + futureMatchCount, 1);
            const currentWp = Number(current.wp || 0);
            const bestAverage = (currentWp + (futureMatchCount * 3)) / totalMatches;
            const worstAverage = currentWp / totalMatches;
            const otherAverages = rankings
                .filter(r => r.team?.name !== teamNum)
                .map(r => {
                    const otherPlayed = Number(r.wins || 0) + Number(r.losses || 0) + Number(r.ties || 0);
                    return otherPlayed > 0 ? Number(r.wp || 0) / otherPlayed : 0;
                });

            return {
                best: 1 + otherAverages.filter(avg => avg > bestAverage).length,
                worst: 1 + otherAverages.filter(avg => avg >= worstAverage).length
            };
        }

        function normalizeMatch(match) {
            const alliances = Array.isArray(match.alliances) ? match.alliances : [];
            const byColor = (color) => alliances.find(a => a.color === color) || { score: null, teams: [] };
            const normalizeAlliance = (alliance) => ({
                score: alliance.score ?? null,
                teams: (alliance.teams || []).map(entry => ({
                    team: typeof entry.team === 'string' ? entry.team : (entry.team?.name || '')
                }))
            });
            return {
                ...match,
                match_number: match.match_number || match.name || `Match ${match.matchnum ?? ''}`,
                start: match.start || match.scheduled,
                alliances: {
                    blue: normalizeAlliance(byColor('blue')),
                    red: normalizeAlliance(byColor('red'))
                }
            };
        }

        async function fetchTeamId() {
            const url = `${API_BASE}/teams?number[]=${TEAM_NUMBER}`;
            const data = await fetchWithAuth(url);
            const teams = responseItems(data);
            if (teams.length > 0) {
                return teams[0].id;
            }
            throw new Error('Team not found');
        }

function processMatches(matches, teamNum) {
            const sortedMatches = [...matches].sort((a, b) => {
                const numA = parseInt(a.match_number.replace(/[^0-9]/g, '')) || 0;
                const numB = parseInt(b.match_number.replace(/[^0-9]/g, '')) || 0;
                return numA - numB;
            });

            let lastScored = null;
            for (let i = sortedMatches.length - 1; i >= 0; i--) {
                const m = sortedMatches[i];
                if (m.scored === true || (m.alliances && m.alliances.blue && m.alliances.blue.score !== null)) {
                    lastScored = m;
                    break;
                }
            }

            let nextMatch = null;
            for (const m of sortedMatches) {
                if (m.scored === true || (m.alliances && m.alliances.blue && m.alliances.blue.score !== null)) continue;
                const inBlue = m.alliances.blue && m.alliances.blue.teams && m.alliances.blue.teams.some(t => t.team === teamNum);
                const inRed = m.alliances.red && m.alliances.red.teams && m.alliances.red.teams.some(t => t.team === teamNum);
                if (inBlue || inRed) {
                    nextMatch = m;
                    break;
                }
            }

            let remaining = 0;
            if (lastScored && nextMatch) {
                const lastIdx = sortedMatches.indexOf(lastScored);
                const nextIdx = sortedMatches.indexOf(nextMatch);
                remaining = nextIdx - lastIdx;
            } else if (nextMatch) {
                remaining = sortedMatches.indexOf(nextMatch);
            }

            const subsequent = [];
            if (nextMatch) {
                const nextIdx = sortedMatches.indexOf(nextMatch);
                for (let i = nextIdx + 1; i < sortedMatches.length; i++) {
                    const m = sortedMatches[i];
                    if (m.scored === true || (m.alliances && m.alliances.blue && m.alliances.blue.score !== null)) continue;
                    const inBlue = m.alliances.blue && m.alliances.blue.teams && m.alliances.blue.teams.some(t => t.team === teamNum);
                    const inRed = m.alliances.red && m.alliances.red.teams && m.alliances.red.teams.some(t => t.team === teamNum);
                    if (inBlue || inRed) {
                        subsequent.push(m);
                    }
                }
            }

            return {
                lastScored,
                nextMatch,
                remaining,
                subsequent
            };
        }
        async function fetchEventsForTeam(teamId) {
            const key = `events:${teamId}`;
            const cached = apiCache.get(key);
            if (cached && Date.now() - cached.timestamp < API_CACHE_TTL) return cached.items;
            const items = responseItems(await fetchWithAuth(`${API_BASE}/teams/${teamId}/events?per_page=250`));
            apiCache.set(key, { items, timestamp: Date.now() });
            return items;
        }

function updateUI() {
            loadingEl.classList.add('hidden');
            errorEl.classList.add('hidden');
            appEl.classList.remove('hidden');

            remainingMatchesEl.textContent = `${state.remainingMatchesCount} Matches Remaining`;
            nextMatchIdEl.textContent = state.nextMatchForTeam ? state.nextMatchForTeam.match_number : 'No Upcoming Matches';

            if (state.nextMatchForTeam) {
                const m = state.nextMatchForTeam;
                blueTeam1El.textContent = m.alliances.blue.teams[0]?.team || '--';
                blueTeam2El.textContent = m.alliances.blue.teams[1]?.team || '--';
                redTeam1El.textContent = m.alliances.red.teams[0]?.team || '--';
                redTeam2El.textContent = m.alliances.red.teams[1]?.team || '--';

                const teamClass = (t) => t === TEAM_NUMBER ? 'highlight-team' : '';
                blueTeam1El.className = `text-xl font-bold ${teamClass(m.alliances.blue.teams[0]?.team)}`;
                blueTeam2El.className = `text-xl font-bold ${teamClass(m.alliances.blue.teams[1]?.team)}`;
                redTeam1El.className = `text-xl font-bold ${teamClass(m.alliances.red.teams[0]?.team)}`;
                redTeam2El.className = `text-xl font-bold ${teamClass(m.alliances.red.teams[1]?.team)}`;

                const inBlue = m.alliances.blue.teams.some(t => t.team === TEAM_NUMBER);
                const inRed = m.alliances.red.teams.some(t => t.team === TEAM_NUMBER);

                document.getElementById('blue-alliance').className = inBlue 
                    ? 'flex-1 flex flex-col gap-2 bg-blue-600/30 rounded-lg p-3 glow-border' 
                    : 'flex-1 flex flex-col gap-2 bg-blue-600/30 rounded-lg p-3';
                document.getElementById('red-alliance').className = inRed 
                    ? 'flex-1 flex flex-col gap-2 bg-red-600/30 rounded-lg p-3 glow-border-red' 
                    : 'flex-1 flex flex-col gap-2 bg-red-600/30 rounded-lg p-3';
            } else {
                blueTeam1El.textContent = '--';
                blueTeam2El.textContent = '--';
                redTeam1El.textContent = '--';
                redTeam2El.textContent = '--';
                document.getElementById('blue-alliance').className = 'flex-1 flex flex-col gap-2 bg-blue-600/30 rounded-lg p-3';
                document.getElementById('red-alliance').className = 'flex-1 flex flex-col gap-2 bg-red-600/30 rounded-lg p-3';
            }

            eventNameEl.textContent = state.event ? state.event.name : 'Unknown Event';
            divisionNameEl.textContent = state.divisionId ? state.divisionId : 'Unknown Division';
            lastScoredEl.textContent = state.lastScoredMatch ? state.lastScoredMatch.match_number : 'None';
            qualificationRankEl.textContent = state.qualificationRank ? `#${state.qualificationRank}` : '--';
            bestQualificationRankEl.textContent = state.bestQualificationRank ? `#${state.bestQualificationRank}` : '--';
            worstQualificationRankEl.textContent = state.worstQualificationRank ? `#${state.worstQualificationRank}` : '--';
            skillsRankEl.textContent = state.skillsRank ? `#${state.skillsRank}` : '--';
            updateRefreshAge();
            eventInfoEl.textContent = state.event ? `${state.event.name} - ${state.event.start.split('T')[0]}` : '';

            queueListEl.innerHTML = '';
            if (state.subsequentMatches.length === 0) {
                const div = document.createElement('div');
                div.className = 'text-center text-zinc-500 py-4';
                div.textContent = 'No upcoming matches';
                queueListEl.appendChild(div);
            } else {
                state.subsequentMatches.forEach(m => {
                    const div = document.createElement('div');
                    div.className = 'bg-zinc-800/50 rounded-lg p-3 flex justify-between items-start';
                    div.innerHTML = `
                        <div>
                            <span class="font-semibold">${m.match_number}</span>
                            <span class="ml-2 text-xs text-zinc-400">${new Date(m.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <div class="flex gap-3 text-sm">
                            <div class="bg-blue-600/30 rounded px-2 py-1">
                                <span>${m.alliances.blue.teams[0]?.team || ''}</span> 
                                <span>${m.alliances.blue.teams[1]?.team || ''}</span>
                            </div>
                            <div class="bg-red-600/30 rounded px-2 py-1">
                                <span>${m.alliances.red.teams[0]?.team || ''}</span> 
                                <span>${m.alliances.red.teams[1]?.team || ''}</span>
                            </div>
                        </div>
                    `;
                    queueListEl.appendChild(div);
                });
            }
        }

        function updateRefreshAge() {
            lastRefreshedEl.textContent = state.lastUpdated
                ? `Last refreshed: ${Math.floor((Date.now() - state.lastUpdated) / 1000)} seconds ago`
                : 'Last refreshed: waiting';
        }

        function findCurrentEvent(events) {
            if (!events || events.length === 0) throw new Error('No events found for team');
            const now = new Date();
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);
            const nextWeek = new Date(today);
            nextWeek.setDate(nextWeek.getDate() + 7);

            const active = events.filter(e => {
                const start = new Date(e.start);
                const end = new Date(e.end || e.start);
                return start <= now && end >= now;
            });
            if (active.length > 0) {
                return active.reduce((a, b) => new Date(a.start) > new Date(b.start) ? a : b);
            }

            const imminent = events.filter(e => {
                const start = new Date(e.start);
                return start >= today && start <= nextWeek;
            });
            if (imminent.length > 0) {
                return imminent.reduce((a, b) => new Date(a.start) < new Date(b.start) ? a : b);
            }

            const past = events.filter(e => new Date(e.start) < today);
            if (past.length > 0) {
                return past.reduce((a, b) => new Date(a.start) > new Date(b.start) ? a : b);
            }
            return events.reduce((a, b) => new Date(a.start) < new Date(b.start) ? a : b);
        }
async function updateData() {
            try {
                const teamId = await fetchTeamId();
                state.teamId = teamId;

                const events = await fetchEventsForTeam(teamId);
                state.event = findCurrentEvent(events);

                const divisions = await fetchDivisionsForEvent(state.event.id);

                // Find a division where the team has at least one match
                let divisionId = null;
                let divisionMatches = null;
                for (const division of divisions) {
                    const matches = await fetchMatchesForDivision(state.event.id, division.id);
                    // Check if the team has any matches in this division
                    const teamHasMatch = matches.some(m => {
                        const inBlue = m.alliances.blue && m.alliances.blue.teams && m.alliances.blue.teams.some(t => t.team === TEAM_NUMBER);
                        const inRed = m.alliances.red && m.alliances.red.teams && m.alliances.red.teams.some(t => t.team === TEAM_NUMBER);
                        return inBlue || inRed;
                    });
                    if (teamHasMatch) {
                        divisionId = division.id;
                        divisionMatches = matches;
                        break;
                    }
                }

                if (!divisionId) {
                    throw new Error('Team not found in any division for the event');
                }

                state.divisionId = divisionId;
                state.matches = divisionMatches;

                const processed = processMatches(divisionMatches, TEAM_NUMBER);
                state.lastScoredMatch = processed.lastScored;
                state.nextMatchForTeam = processed.nextMatch;
                state.remainingMatchesCount = processed.remaining;
                state.subsequentMatches = processed.subsequent;
                try {
                    const rankings = await fetchAllPages(`${API_BASE}/events/${state.event.id}/divisions/${divisionId}/rankings`);
                    const teamRanking = rankings.find(r => r.team?.name === TEAM_NUMBER);
                    state.qualificationRank = teamRanking?.rank ?? null;
                    const futureTeamMatches = divisionMatches.filter(m => {
                        const inBlue = m.alliances.blue?.teams?.some(t => t.team === TEAM_NUMBER);
                        const inRed = m.alliances.red?.teams?.some(t => t.team === TEAM_NUMBER);
                        const scored = m.scored === true || m.alliances.blue?.score !== null || m.alliances.red?.score !== null;
                        return (inBlue || inRed) && !scored;
                    }).length;
                    const bounds = calculateQualificationBounds(rankings, TEAM_NUMBER, futureTeamMatches);
                    state.bestQualificationRank = bounds.best;
                    state.worstQualificationRank = bounds.worst;
                    const skills = await fetchAllPages(`${API_BASE}/events/${state.event.id}/skills`);
                    const teamSkills = skills.filter(s => s.team?.name === TEAM_NUMBER && Number.isFinite(Number(s.rank)));
                    state.skillsRank = teamSkills.length > 0 ? Math.min(...teamSkills.map(s => Number(s.rank))) : null;
                } catch (rankingError) {
                    console.warn('Ranking data unavailable:', rankingError);
                    state.qualificationRank = null;
                    state.bestQualificationRank = null;
                    state.worstQualificationRank = null;
                    state.skillsRank = null;
                }
                state.lastUpdated = Date.now();

                updateUI();
            } catch (err) {
                console.error('Error updating data:', err);
                loadingEl.classList.add('hidden');
                errorEl.classList.remove('hidden');
                errorEl.textContent = `Error: ${err.message}`;
                appEl.classList.add('hidden');
            }
        }

        // Event listeners
        refreshBtn.addEventListener('click', updateData);

        // Initial load
        updateData();

        // Auto-refresh every 30 seconds
        setInterval(updateData, 30000);
        setInterval(updateRefreshAge, 1000);

        async function fetchDivisionsForEvent(eventId) {
            const key = `divisions:${eventId}`;
            const cached = apiCache.get(key);
            if (cached && Date.now() - cached.timestamp < API_CACHE_TTL) return cached.items;
            const event = await fetchWithAuth(`${API_BASE}/events/${eventId}`);
            const items = Array.isArray(event?.divisions) ? event.divisions : [];
            apiCache.set(key, { items, timestamp: Date.now() });
            return items;
        }

        async function fetchMatchesForDivision(eventId, divisionId) {
            const key = `matches:${eventId}:${divisionId}`;
            const cached = apiCache.get(key);
            if (cached && Date.now() - cached.timestamp < 45 * 1000) return cached.items;
            const response = await fetchWithAuth(`${API_BASE}/events/${eventId}/divisions/${divisionId}/matches?per_page=250`);
            const items = responseItems(response).map(normalizeMatch);
            apiCache.set(key, { items, timestamp: Date.now() });
            return items;
        }
