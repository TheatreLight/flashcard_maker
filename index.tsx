/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import {GoogleGenAI} from '@google/genai';

interface Flashcard {
  emoji: string;
  term: string;
  definition: string;
}

// --- DOM Elements ---
const topicInput = document.getElementById('topicInput') as HTMLTextAreaElement;
const generateButton = document.getElementById(
  'generateButton',
) as HTMLButtonElement;
const shuffleButton = document.getElementById(
  'shuffleButton',
) as HTMLButtonElement;
const modeSwitchButton = document.getElementById(
  'modeSwitchButton',
) as HTMLButtonElement;
const flashcardsContainer = document.getElementById(
  'flashcardsContainer',
) as HTMLDivElement;
const errorMessage = document.getElementById('errorMessage') as HTMLDivElement;
const focusNav = document.getElementById('focusNav') as HTMLDivElement;
const prevButton = document.getElementById('prevButton') as HTMLButtonElement;
const nextButton = document.getElementById('nextButton') as HTMLButtonElement;
const cardCounter = document.getElementById('cardCounter') as HTMLSpanElement;

const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

// --- State Variables ---
let isFocusMode = false;
let currentCardIndex = 0;

// --- Sound Effects ---
let audioContext: AudioContext | null = null;

const playHoverSound = () => {
  if (!audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
  gainNode.gain.setValueAtTime(0.08, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(
    0.0001,
    audioContext.currentTime + 0.1,
  );
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.1);
};

const playFlipSound = () => {
  if (!audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(
    600,
    audioContext.currentTime + 0.1,
  );
  gainNode.gain.setValueAtTime(0.12, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(
    0.0001,
    audioContext.currentTime + 0.15,
  );
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.15);
};
// --- End Sound Effects ---

// --- Mode and UI Management ---
const resetUI = () => {
  isFocusMode = false;
  currentCardIndex = 0;
  flashcardsContainer.classList.remove('focus-mode');
  modeSwitchButton.textContent = 'Focus Mode';
  modeSwitchButton.hidden = true;
  shuffleButton.hidden = true;
  focusNav.hidden = true;
};

const updateCardVisibility = () => {
  const cards = flashcardsContainer.querySelectorAll('.flashcard');
  const hasCards = cards.length > 0;

  // Centralize visibility logic for all dynamic UI elements.
  // This is the single source of truth.
  shuffleButton.hidden = !hasCards;
  modeSwitchButton.hidden = !hasCards;
  focusNav.hidden = !isFocusMode || !hasCards; // The most important rule

  if (!hasCards) {
    // If no cards, ensure we're not in focus mode and the class is removed.
    if (isFocusMode) {
      isFocusMode = false;
    }
    flashcardsContainer.classList.remove('focus-mode');
    modeSwitchButton.textContent = 'Focus Mode'; // Reset text just in case
    return;
  }

  // If we have cards, update the UI based on the current mode
  flashcardsContainer.classList.toggle('focus-mode', isFocusMode);

  if (isFocusMode) {
    modeSwitchButton.textContent = 'Grid Mode';
    cards.forEach((card, index) => {
      card.classList.toggle('active', index === currentCardIndex);
    });
    cardCounter.textContent = `${currentCardIndex + 1} / ${cards.length}`;
  } else {
    // Grid Mode
    modeSwitchButton.textContent = 'Focus Mode';
    cards.forEach((card) => card.classList.remove('active')); // Ensure no card is active
  }
};

const navigateCards = (direction: 'next' | 'prev') => {
  const cards = flashcardsContainer.querySelectorAll('.flashcard');
  if (cards.length <= 1) return;

  const currentCardElement = cards[currentCardIndex];
  if (currentCardElement) {
    currentCardElement.classList.remove('flipped');
  }

  let newIndex = currentCardIndex;
  if (direction === 'next') {
    newIndex = (currentCardIndex + 1) % cards.length;
  } else {
    // 'prev'
    newIndex = (currentCardIndex - 1 + cards.length) % cards.length;
  }
  currentCardIndex = newIndex;
  updateCardVisibility();
};

modeSwitchButton.addEventListener('click', () => {
  isFocusMode = !isFocusMode;

  if (isFocusMode) {
    currentCardIndex = 0; // Always start from the first card
  } else {
    // Reset all cards when exiting focus mode
    flashcardsContainer
      .querySelectorAll('.flashcard.flipped')
      .forEach((card) => {
        card.classList.remove('flipped');
      });
  }
  // The new function will handle all DOM class/text changes
  updateCardVisibility();
});

nextButton.addEventListener('click', () => navigateCards('next'));
prevButton.addEventListener('click', () => navigateCards('prev'));
// --- End Mode and UI Management ---

generateButton.addEventListener('click', async () => {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    } catch (e) {
      console.error('Web Audio API is not supported in this browser.');
    }
  }

  const topic = topicInput.value.trim();
  if (!topic) {
    errorMessage.textContent =
      'Please enter a topic or some terms and definitions.';
    flashcardsContainer.textContent = '';
    return;
  }

  errorMessage.textContent = 'Generating flashcards...';
  flashcardsContainer.textContent = '';
  resetUI();
  generateButton.disabled = true;

  try {
    let flashcards: Flashcard[] = [];
    const isKeyValueInput = topic.includes(':') && topic.includes('\n');

    if (isKeyValueInput) {
      // --- Path for "Term: Definition" pairs ---
      errorMessage.textContent = 'Generating emojis for your list...';

      const lines = topic
        .split('\n')
        .filter((line) => line.trim() !== '' && line.includes(':'));
      const termDefPairs = lines.map((line) => {
        const parts = line.split(':');
        const term = parts[0].trim();
        const definition = parts.slice(1).join(':').trim();
        return {term, definition};
      });

      if (termDefPairs.length === 0) {
        throw new Error("Invalid 'Term: Definition' format.");
      }

      const terms = termDefPairs.map((p) => p.term);

      const emojiPrompt = `For each of the following terms, provide the most relevant single emoji.
Respond with a list where each line is in the format "Term: Emoji".
Do not add any other text, explanations, or formatting.

Terms:
${terms.join('\n')}
`;
      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: emojiPrompt,
      });
      const emojiResponse = result.text;

      // Parse the response to get a map of term -> emoji
      const emojiMap = new Map<string, string>();
      emojiResponse
        .split('\n')
        .filter((line) => line.trim() !== '' && line.includes(':'))
        .forEach((line) => {
          const parts = line.split(':');
          const term = parts[0].trim();
          const emoji = parts.slice(1).join(':').trim();
          // Find the original term case-insensitively to match AI's potential changes
          const originalTerm = terms.find(
            (t) => t.toLowerCase() === term.toLowerCase(),
          );
          if (originalTerm) {
            emojiMap.set(originalTerm, emoji);
          }
        });

      // Combine original pairs with fetched emojis
      flashcards = termDefPairs.map((pair) => ({
        term: pair.term,
        definition: pair.definition,
        emoji: emojiMap.get(pair.term) || '✨', // Default emoji if not found
      }));
    } else {
      // --- Path for a general topic (existing logic) ---
      const prompt = `Generate a list of flashcards for the topic: "${topic}". For each flashcard, provide the most relevant emoji for the term, the term itself, and a concise definition. The definition MUST be in the same language as the topic. Format the output as a list of "Emoji: Term: Definition" triplets, with each triplet on a new line. For example, if the topic is in Russian, the definitions must also be in Russian.

Example format:
💻: Computer: An electronic device for storing and processing data.
🇷🇺: Россия: Самая большая по площади страна в мире.`;

      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      const flashcardsText = result.text;

      const lines = flashcardsText
        .split('\n')
        .filter((line) => line.trim() !== '');
      flashcards = lines
        .map((line) => {
          const parts = line.split(':');
          if (parts.length >= 3) {
            const emoji = parts[0].trim();
            const term = parts[1].trim();
            const definition = parts.slice(2).join(':').trim();
            return {emoji, term, definition};
          }
          return null;
        })
        .filter((card): card is Flashcard => card !== null);
    }

    if (flashcards.length === 0) {
      throw new Error(
        'Could not generate flashcards. Please try a different topic or format.',
      );
    }

    errorMessage.textContent = ''; // Clear "Generating..." message

    flashcards.forEach((cardData) => {
      const flashcard = document.createElement('div');
      flashcard.className = 'flashcard';

      const flashcardInner = document.createElement('div');
      flashcardInner.className = 'flashcard-inner';

      const flashcardFront = document.createElement('div');
      flashcardFront.className = 'flashcard-front';

      const flashcardBack = document.createElement('div');
      flashcardBack.className = 'flashcard-back';

      const emoji = document.createElement('div');
      emoji.className = 'emoji';
      emoji.textContent = cardData.emoji;

      const term = document.createElement('div');
      term.className = 'term';
      term.textContent = cardData.term;

      const definition = document.createElement('div');
      definition.className = 'definition';
      definition.textContent = cardData.definition;

      flashcardFront.appendChild(emoji);
      flashcardFront.appendChild(term);
      flashcardBack.appendChild(definition);
      flashcardInner.appendChild(flashcardFront);
      flashcardInner.appendChild(flashcardBack);
      flashcard.appendChild(flashcardInner);

      // Add delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-card-btn';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.setAttribute('aria-label', 'Delete card');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent card from flipping
        flashcard.classList.add('removing');
        // Wait for animation to finish before removing from DOM
        flashcard.addEventListener('transitionend', () => {
          flashcard.remove();
          updateCardVisibility();
        });
      });
      flashcard.appendChild(deleteBtn);

      flashcard.addEventListener('click', () => {
        playFlipSound();
        flashcard.classList.toggle('flipped');
      });
      flashcard.addEventListener('mouseenter', playHoverSound);

      flashcardsContainer.appendChild(flashcard);
    });

    topicInput.value = '';
  } catch (error) {
    console.error('Error generating flashcards:', error);
    errorMessage.textContent =
      'An error occurred. Please check the console and try again.';
  } finally {
    generateButton.disabled = false;
    updateCardVisibility();
  }
});

shuffleButton.addEventListener('click', () => {
  const cards = Array.from(
    flashcardsContainer.querySelectorAll('.flashcard'),
  ) as HTMLElement[];
  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    flashcardsContainer.insertBefore(cards[j], cards[i]);
  }
});
