/**
 * Pokemon Tug of War - Logic Script
 */

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTZBSB2UBklxSCr3Q-g6DyJ731csJmsh2-GyZ8ajbdTuYWFrA3KLUdS8SsbHOcENX3PnMknXP2KRpqs/pub?output=csv';

// State
let allData = [];
let topics = [];
let selectedTopic = 'all';
let questionCount = 15;
let gameMode = 'pvp';
let gameDifficulty = 'medium';
let gameState = 'loading';
let winner = null;
let ropePosition = 0;
let aiTimer = null;

let team1 = { score: 0, currentIndex: 0, questions: [], isFinished: false };
let team2 = { score: 0, currentIndex: 0, questions: [], isFinished: false };
// Thêm ở đầu file với các state khác
let soundEnabled = true;

// Thêm event listener
document.getElementById('sound-toggle')?.addEventListener('click', function() {
    soundEnabled = !soundEnabled;
    const icon = this.querySelector('i');
    if (soundEnabled) {
        icon.setAttribute('data-lucide', 'volume-2');
    } else {
        icon.setAttribute('data-lucide', 'volume-x');
    }
    lucide.createIcons();
});
// DOM Elements
const loadingScreen = document.getElementById('loading-screen');
const gameContainer = document.getElementById('game-container');
const modeSelect = document.getElementById('mode-select');
const difficultyContainer = document.getElementById('difficulty-container');
const difficultySelect = document.getElementById('difficulty-select');
const topicSelect = document.getElementById('topic-select');
const countSelect = document.getElementById('count-select');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const ropeBar = document.getElementById('rope-bar');
const scoreTeam1 = document.getElementById('score-team1');
const scoreTeam2 = document.getElementById('score-team2');
const statusLine = document.getElementById('status-line');
const winnerMessage = document.getElementById('winner-message');

const team1Elements = {
    play: document.getElementById('play-team1'),
    progress: document.getElementById('progress-team1'),
    question: document.getElementById('question-team1'),
    options: document.getElementById('options-team1'),
    placeholder: document.getElementById('placeholder-team1')
};

const team2Elements = {
    play: document.getElementById('play-team2'),
    progress: document.getElementById('progress-team2'),
    question: document.getElementById('question-team2'),
    options: document.getElementById('options-team2'),
    placeholder: document.getElementById('placeholder-team2')
};

const footerRound = document.getElementById('footer-round');
const footerTopic = document.getElementById('footer-topic');

// Initialization
async function init() {
    lucide.createIcons();
    try {
        const response = await fetch(CSV_URL);
        if (!response.ok) throw new Error('Không thể tải dữ liệu');
        const csvText = await response.text();

        Papa.parse(csvText, {
            complete: (results) => {
                const data = results.data;
                if (!data || data.length < 2) {
                    showError('Dữ liệu trống hoặc không hợp lệ');
                    return;
                }

                allData = data.slice(1)
                    .filter(row => row[2] && row[24] && row[6])
                    .map(row => ({
                        topic: row[6]?.trim() || 'Unknown',
                        english: row[2]?.trim(),
                        vietnamese: row[24]?.trim()
                    }));

                if (allData.length === 0) {
                    showError('Không tìm thấy từ vựng nào');
                } else {
                    topics = Array.from(new Set(allData.map(item => item.topic))).sort();
                    populateTopics();
                    setGameState('setup');
                }
            }
        });
    } catch (err) {
        showError('Lỗi kết nối mạng hoặc link Google Sheets không hợp lệ');
    }
}

function populateTopics() {
    const allTopicsOption = '<option value="all" selected>Tất cả chủ đề</option>';
    const topicOptions = topics.map(t => `<option value="${t}">${t}</option>`).join('');
    topicSelect.innerHTML = allTopicsOption + topicOptions;
    selectedTopic = 'all';
}

// Event listener cho mode select
modeSelect.addEventListener('change', function() {
    if (this.value === 'pve') {
        difficultyContainer.classList.remove('hidden');
    } else {
        difficultyContainer.classList.add('hidden');
    }
});

function showError(msg) {
    statusLine.textContent = msg;
    statusLine.classList.add('text-red-500');
    setGameState('setup');
}

function setGameState(state) {
    gameState = state;
    loadingScreen.classList.toggle('hidden', state !== 'loading');
    gameContainer.classList.toggle('hidden', state === 'loading');

    if (state === 'setup') {
        startBtn.disabled = false;
        modeSelect.disabled = false;
        topicSelect.disabled = false;
        countSelect.disabled = false;
        if (difficultySelect) difficultySelect.disabled = false;
        winnerMessage.classList.add('hidden');
        if (aiTimer) clearTimeout(aiTimer);
        team1Elements.placeholder.classList.remove('hidden');
        team2Elements.placeholder.classList.remove('hidden');
        team1Elements.options.innerHTML = '';
        team2Elements.options.innerHTML = '';
        team1Elements.question.textContent = 'Sẵn sàng?';
        team2Elements.question.textContent = 'Sẵn sàng?';
    } else if (state === 'playing') {
        startBtn.disabled = true;
        modeSelect.disabled = true;
        topicSelect.disabled = true;
        countSelect.disabled = true;
        if (difficultySelect) difficultySelect.disabled = true;
        team1Elements.placeholder.classList.add('hidden');
        team2Elements.placeholder.classList.add('hidden');
    } else if (state === 'winner') {
        startBtn.disabled = true;
        const overlay = document.getElementById('winner-overlay');
        const winnerMsg = document.getElementById('winner-message');

        overlay.classList.add('show');
        winnerMsg.classList.remove('hidden');
        winnerMsg.textContent = `🏆 ĐỘI ${winner === 1 ? 'CHARIZARD' : 'BLASTOISE'} CHIẾN THẮNG! 🏆`;

        if (winner === 1) {
            winnerMsg.style.background = 'linear-gradient(135deg, #ff6b6b, #ff8787)';
        } else {
            winnerMsg.style.background = 'linear-gradient(135deg, #4ecdc4, #6cd4cc)';
        }

        // Tự động ẩn sau 5 giây
        setTimeout(() => {
            overlay.classList.remove('show');
            winnerMsg.classList.add('hidden');
        }, 5000);
    }
}

function generateQuestions(pool, count) {
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);

    return selected.map((item, idx) => {
        const distractors = pool
            .filter(p => p.english !== item.english)
            .sort(() => 0.5 - Math.random())
            .slice(0, 3)
            .map(p => p.english);

        const options = [...distractors, item.english].sort(() => 0.5 - Math.random());

        return {
            vietnamese: item.vietnamese,
            correctAnswer: item.english,
            options
        };
    });
}

function startGame() {
    selectedTopic = topicSelect.value;
    questionCount = Number(countSelect.value);
    gameMode = modeSelect.value;
    gameDifficulty = difficultySelect ? difficultySelect.value : 'medium';

    let pool;
    if (selectedTopic === 'all') {
        pool = [...allData];
    } else {
        pool = allData.filter(item => item.topic === selectedTopic);
    }

    if (pool.length < 4) {
        alert('Không đủ từ vựng (cần ít nhất 4 từ).');
        return;
    }

    team1 = { score: 0, currentIndex: 0, questions: generateQuestions(pool, questionCount), isFinished: false };
    team2 = { score: 0, currentIndex: 0, questions: generateQuestions(pool, questionCount), isFinished: false };

    ropePosition = 0;
    winner = null;

    updateUI();
    setGameState('playing');
    renderQuestion(1);
    renderQuestion(2);

    if (gameMode === 'pve') {
        scheduleAIAnswer();
    }
}

function scheduleAIAnswer() {
    if (gameState !== 'playing' || team2.isFinished) return;

    let delay, accuracy;

    switch(gameDifficulty) {
        case 'easy':
            delay = 3000 + Math.random() * 2000;
            accuracy = 0.5;
            break;
        case 'hard':
            delay = 1000 + Math.random() * 1000;
            accuracy = 0.95;
            break;
        case 'medium':
        default:
            delay = 2000 + Math.random() * 2000;
            accuracy = 0.75;
    }

    aiTimer = setTimeout(() => {
        if (gameState !== 'playing' || team2.isFinished) return;

        const q = team2.questions[team2.currentIndex];
        const isCorrect = Math.random() < accuracy;
        let selectedOption;

        if (isCorrect) {
            selectedOption = q.correctAnswer;
        } else {
            const wrongs = q.options.filter(opt => opt !== q.correctAnswer);
            selectedOption = wrongs[Math.floor(Math.random() * wrongs.length)];
        }

        handleAnswer(2, selectedOption);
    }, delay);
}

function updateUI() {
    scoreTeam1.textContent = team1.score;
    scoreTeam2.textContent = team2.score;
    ropeBar.style.left = `calc(50% + (${ropePosition} * 8%))`;

    team1Elements.progress.textContent = `${team1.currentIndex + 1}/${questionCount}`;
    team2Elements.progress.textContent = `${team2.currentIndex + 1}/${questionCount}`;

    footerRound.textContent = `Vòng ${Math.max(team1.currentIndex, team2.currentIndex) + 1}/${questionCount}`;

    let topicDisplay = selectedTopic === 'all' ? 'Tất cả chủ đề' : selectedTopic;
    footerTopic.textContent = `Chủ đề: ${topicDisplay}`;
}

function renderQuestion(teamNum) {
    const team = teamNum === 1 ? team1 : team2;
    const elements = teamNum === 1 ? team1Elements : team2Elements;

    if (team.isFinished) {
        elements.question.textContent = 'Xong!';
        elements.options.innerHTML = '';
        return;
    }

    const q = team.questions[team.currentIndex];
    elements.question.textContent = q.vietnamese;

    elements.options.innerHTML = q.options.map(opt => `
        <button class="option-btn p-2 md:p-3 rounded-[12px] border-3 border-[#333] font-bold transition-all text-sm md:text-base uppercase bg-white text-[#333] shadow-[0_3px_0_#333] hover:-translate-y-1 active:translate-y-0.5" data-option="${opt}">
            ${opt}
        </button>
    `).join('');

    const buttons = elements.options.querySelectorAll('.option-btn');
    buttons.forEach(btn => {
        btn.onclick = () => handleAnswer(teamNum, btn.dataset.option);
    });
}

function handleAnswer(teamNum, selectedOption) {
    if (gameState !== 'playing') return;

    const team = teamNum === 1 ? team1 : team2;
    if (team.isFinished) return;

    const q = team.questions[team.currentIndex];
    const isCorrect = selectedOption === q.correctAnswer;

    // Đọc đáp án tiếng Anh
    if ('speechSynthesis' in window) {
        // Dừng mọi giọng đọc hiện tại
        window.speechSynthesis.cancel();

        // Tạo giọng đọc mới
        const utterance = new SpeechSynthesisUtterance(selectedOption);
        utterance.lang = 'en-US'; // Tiếng Anh Mỹ
        utterance.rate = 0.9; // Tốc độ đọc hơi chậm một chút
        utterance.pitch = 1;

        // Chọn giọng đọc (ưu tiên giọng nữ)
        const voices = window.speechSynthesis.getVoices();
        const englishVoice = voices.find(voice => voice.lang.includes('en') && voice.name.includes('Google'));
        if (englishVoice) {
            utterance.voice = englishVoice;
        }

        window.speechSynthesis.speak(utterance);
    }

    // Visual feedback
    const elements = teamNum === 1 ? team1Elements : team2Elements;
    const buttons = elements.options.querySelectorAll('.option-btn');

    buttons.forEach(btn => {
        btn.disabled = true;
        if (btn.dataset.option === q.correctAnswer) {
            btn.className = "p-2 md:p-3 rounded-[12px] border-3 font-bold text-sm md:text-base uppercase bg-emerald-500 text-white border-emerald-700 shadow-[0_3px_0_#065f46]";
        } else if (btn.dataset.option === selectedOption && !isCorrect) {
            btn.className = "p-2 md:p-3 rounded-[12px] border-3 font-bold text-sm md:text-base uppercase bg-rose-500 text-white border-rose-700 shadow-[0_3px_0_#9f1239]";
        }
    });

    setTimeout(() => {
        if (isCorrect) {
            team.score++;
            ropePosition += (teamNum === 1 ? -1 : 1);
            if (Math.abs(ropePosition) >= 3) {
                winner = ropePosition <= -3 ? 1 : 2;
                setGameState('winner');
            }
        }

        team.currentIndex++;
        if (team.currentIndex >= questionCount) {
            team.isFinished = true;
        }

        updateUI();
        if (gameState === 'playing') {
            renderQuestion(teamNum);
            if (teamNum === 2 && gameMode === 'pve') {
                scheduleAIAnswer();
            }
        }
    }, 800);
}

function resetGame() {
    setGameState('setup');
    ropePosition = 0;
    updateUI();

    const overlay = document.getElementById('winner-overlay');
    const winnerMsg = document.getElementById('winner-message');
    if (overlay) overlay.classList.remove('show');
    if (winnerMsg) winnerMsg.classList.add('hidden');
}

// Event Listeners
startBtn.onclick = startGame;
resetBtn.onclick = resetGame;

// Run
init();