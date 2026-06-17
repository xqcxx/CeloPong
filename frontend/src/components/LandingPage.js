import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BACKEND_URL, LOBBY_ROUTE } from '../constants';
import { BLOCK_EXPLORER_URL, PONG_ESCROW_ADDRESS } from '../contracts/PongEscrow';
import { CURRENCIES } from '../config/currencies';
import { ENVIRONMENT } from '../config/env';
import '../styles/LandingPage.css';

const currencySymbols = Object.values(CURRENCIES).map(currency => currency.symbol);

const howItWorks = [
  {
    title: 'Connect and choose a name',
    body: 'Link a Celo wallet, then sign a message to register a 2-15 character username. The signature proves wallet ownership without sending a transaction.'
  },
  {
    title: 'Create the stake',
    body: 'Pick CELO, cUSD, USDC, or USDT and choose a stake amount. The creator selects the currency for the room.'
  },
  {
    title: 'Match the room terms',
    body: 'The opponent joins the same 6-character room and stakes the exact same token and amount before play begins.'
  },
  {
    title: 'Win and claim',
    body: 'The first player to 5 points wins. Staked winners claim the full 2x pot with a backend-signed final result.'
  }
];

const modes = [
  {
    title: 'Staked Match',
    body: 'Create a room, escrow your stake on Celo, and invite an opponent to match it.'
  },
  {
    title: 'Public Challenge',
    body: 'Make a staked room visible on the challenge board so another player can accept it.'
  },
  {
    title: 'Join Room',
    body: 'Enter a 6-character code to join a private match or complete an existing staked room.'
  },
  {
    title: 'Watch Live',
    body: 'Spectate active games from the lobby when live rooms are available.'
  },
  {
    title: 'Practice and Check-In',
    body: 'Record practice sessions, daily check-ins, and daily reward claims as on-chain engagement events.'
  }
];

const safeguards = [
  'Player stakes are held in the PongEscrow contract until the match is resolved, refunded, or claimed.',
  'If player two never joins, the creator can claim a refund after the 10-minute join timeout.',
  'If both staked players abandon an active match, either participant can refund both players with backend authorization.',
  'History blocks legacy claims and requires the winning wallet before prize claims are submitted.'
];

const dashboardItems = [
  'Game history with win, loss, casual, and staked filters.',
  'Claimable-only wins view with claimed transaction links.',
  'Pending stakes with refund countdowns and active match recovery.',
  'ELO leaderboard, win/loss records, and live ranking updates.'
];

const faqs = [
  {
    question: 'Which wallets are supported?',
    answer: 'The app uses Reown AppKit and Wagmi for Celo wallets, with MiniPay-aware handling when MiniPay is detected.'
  },
  {
    question: 'Which tokens can be staked?',
    answer: `The current staking options are ${currencySymbols.join(', ')}. The room creator chooses the token, and the joiner must match it.`
  },
  {
    question: 'Can gas be paid with stablecoins?',
    answer: 'Where Celo fee abstraction is supported, the stake flow can offer cUSD as a gas option and adapter-backed gas payment for supported 6-decimal tokens.'
  },
  {
    question: 'What happens if nobody joins?',
    answer: 'A player-one stake remains recoverable after the 10-minute join timeout. The lobby shows pending stakes and the refund action.'
  },
  {
    question: 'What happens if players disconnect?',
    answer: 'Staked matches track reconnect windows. If both windows expire, the match can become refundable for both players.'
  },
  {
    question: 'Why do I sign wallet messages?',
    answer: 'Username and wallet-session signatures prove wallet ownership. They do not authorize token transfers or blockchain transactions.'
  }
];

function formatAddress(address) {
  if (!address) return 'Configured by environment';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function LandingPage() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [loadingLiveData, setLoadingLiveData] = useState(true);

  const explorerHref = BLOCK_EXPLORER_URL && PONG_ESCROW_ADDRESS
    ? `${BLOCK_EXPLORER_URL}/address/${PONG_ESCROW_ADDRESS}`
    : null;

  useEffect(() => {
    let isMounted = true;

    async function loadLiveData() {
      setLoadingLiveData(true);
      try {
        const [leaderboardResponse, challengesResponse] = await Promise.allSettled([
          fetch(`${BACKEND_URL}/api/rankings/top?limit=5`),
          fetch(`${BACKEND_URL}/games/challenges`)
        ]);

        if (!isMounted) return;

        if (leaderboardResponse.status === 'fulfilled' && leaderboardResponse.value.ok) {
          const players = await leaderboardResponse.value.json();
          setLeaderboard(Array.isArray(players) ? players : []);
        }

        if (challengesResponse.status === 'fulfilled' && challengesResponse.value.ok) {
          const openChallenges = await challengesResponse.value.json();
          setChallenges(Array.isArray(openChallenges) ? openChallenges : []);
        }
      } catch (error) {
        console.error('Unable to load landing page live data:', error);
      } finally {
        if (isMounted) setLoadingLiveData(false);
      }
    }

    loadLiveData();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <nav className="landing-nav" aria-label="PONG-IT website navigation">
          <Link to="/" className="landing-brand">
            <span className="landing-brand-mark">P</span>
            <span>PONG-IT</span>
          </Link>
          <div className="landing-nav-links">
            <a href="#how-it-works">How it works</a>
            <a href="#escrow">Escrow</a>
            <a href="#faq">FAQ</a>
            <Link to={LOBBY_ROUTE} className="landing-nav-cta">Play</Link>
          </div>
        </nav>

        <div className="landing-hero-grid">
          <div className="landing-hero-copy">
            <p className="landing-kicker">Built for MiniPay on Celo</p>
            <h1 id="landing-title">Stake cUSD. Play Pong. Win 2x back.</h1>
            <p>
              PONG-IT is a real-time multiplayer Pong arcade where players can escrow matching stakes on
              Celo, play first-to-5 matches, and claim prizes from verified results.
            </p>
            <div className="landing-actions">
              <Link to={LOBBY_ROUTE} className="landing-button landing-button-primary">Play Now</Link>
              <a href="#how-it-works" className="landing-button landing-button-secondary">See How It Works</a>
            </div>
            <div className="landing-token-strip" aria-label="Supported staking tokens">
              {currencySymbols.map(symbol => <span key={symbol}>{symbol}</span>)}
            </div>
          </div>

          <div className="landing-court" aria-label="PONG-IT staked match preview">
            <div className="landing-score">
              <span>YOU 04</span>
              <span>RIVAL 03</span>
            </div>
            <span className="landing-paddle landing-paddle-left"></span>
            <span className="landing-paddle landing-paddle-right"></span>
            <span className="landing-ball"></span>
            <div className="landing-ticket">
              <span>Escrowed pot</span>
              <strong>2.0 cUSD</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-live" aria-labelledby="live-title">
        <div className="landing-section-heading">
          <p className="landing-kicker">Live highlights</p>
          <h2 id="live-title">The lobby pulse, before you enter the lobby.</h2>
        </div>
        <div className="landing-live-grid">
          <div className="landing-panel">
            <div className="landing-panel-title">
              <h3>Top players</h3>
              <span>{leaderboard.length ? `${leaderboard.length} loaded` : 'Leaderboard'}</span>
            </div>
            <div className="landing-list">
              {leaderboard.length > 0 ? leaderboard.map((player, index) => (
                <div className="landing-row" key={player.name || index}>
                  <span>{index + 1}</span>
                  <strong>{player.name || 'Unknown'}</strong>
                  <em>{player.rating || 1000}</em>
                </div>
              )) : (
                <p className="landing-empty">{loadingLiveData ? 'Loading top players...' : 'No ranked players yet.'}</p>
              )}
            </div>
          </div>
          <div className="landing-panel">
            <div className="landing-panel-title">
              <h3>Open challenges</h3>
              <span>{challenges.length ? `${challenges.length} waiting` : 'Challenge board'}</span>
            </div>
            <div className="landing-list">
              {challenges.length > 0 ? challenges.slice(0, 5).map(challenge => (
                <div className="landing-row" key={challenge.roomCode}>
                  <span>{challenge.roomCode}</span>
                  <strong>{challenge.stakeAmount || 'Open'} {challenge.stakeCurrency || 'CELO'}</strong>
                  <em>Waiting</em>
                </div>
              )) : (
                <p className="landing-empty">{loadingLiveData ? 'Checking challenge board...' : 'No public challenges right now.'}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section" id="how-it-works" aria-labelledby="how-title">
        <div className="landing-section-heading">
          <p className="landing-kicker">How it works</p>
          <h2 id="how-title">From wallet signature to winner claim.</h2>
        </div>
        <div className="landing-step-grid">
          {howItWorks.map((item, index) => (
            <article className="landing-step" key={item.title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-band" aria-labelledby="modes-title">
        <div className="landing-section-heading">
          <p className="landing-kicker">Game modes</p>
          <h2 id="modes-title">Play, challenge, spectate, and keep your streak alive.</h2>
        </div>
        <div className="landing-mode-grid">
          {modes.map(mode => (
            <article className="landing-mode" key={mode.title}>
              <h3>{mode.title}</h3>
              <p>{mode.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-two-column" id="escrow" aria-labelledby="escrow-title">
        <div>
          <p className="landing-kicker">Escrow and safety</p>
          <h2 id="escrow-title">The stake rules are visible before the match starts.</h2>
          <p className="landing-section-copy">
            PONG-IT uses the PongEscrow contract for staked matches. The backend runs the real-time game
            and signs authoritative results, while the winner submits the signed result when claiming the pot.
          </p>
          <div className="landing-contract">
            <span>{ENVIRONMENT} escrow</span>
            {explorerHref ? (
              <a href={explorerHref} target="_blank" rel="noreferrer">{formatAddress(PONG_ESCROW_ADDRESS)}</a>
            ) : (
              <strong>{formatAddress(PONG_ESCROW_ADDRESS)}</strong>
            )}
          </div>
        </div>
        <div className="landing-check-list">
          {safeguards.map(item => <p key={item}>{item}</p>)}
        </div>
      </section>

      <section className="landing-section landing-two-column" aria-labelledby="dashboard-title">
        <div>
          <p className="landing-kicker">Player dashboard</p>
          <h2 id="dashboard-title">Every match leaves a trail you can use.</h2>
          <p className="landing-section-copy">
            The app keeps the important post-game work close to the player: filters, claim state, pending
            stake recovery, active match recovery, and leaderboard movement.
          </p>
          <Link to="/game-history" className="landing-button landing-button-secondary">Open History</Link>
        </div>
        <div className="landing-check-list">
          {dashboardItems.map(item => <p key={item}>{item}</p>)}
        </div>
      </section>

      <section className="landing-section" id="faq" aria-labelledby="faq-title">
        <div className="landing-section-heading">
          <p className="landing-kicker">FAQ</p>
          <h2 id="faq-title">What players need to know before staking.</h2>
        </div>
        <div className="landing-faq-grid">
          {faqs.map(item => (
            <article className="landing-faq" key={item.question}>
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-final">
        <h2>Ready for the next rally?</h2>
        <p>Enter the arcade, connect your wallet, and choose the match that fits your stake.</p>
        <Link to={LOBBY_ROUTE} className="landing-button landing-button-primary">Launch PONG-IT</Link>
      </section>
    </main>
  );
}

export default LandingPage;
