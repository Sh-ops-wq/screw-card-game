export type SoundName = 'draw' | 'discard' | 'swap' | 'reveal' | 'screw' | 'win' | 'error' | 'button' | 'turn';

const SOUND_PREF_KEY = 'screw.soundEnabled';

const SOUND_FILES: Record<SoundName, string> = {
  draw: '/assets/sounds/draw.mp3',
  discard: '/assets/sounds/discard.mp3',
  swap: '/assets/sounds/swap.mp3',
  reveal: '/assets/sounds/reveal.mp3',
  screw: '/assets/sounds/screw.mp3',
  win: '/assets/sounds/win.mp3',
  error: '/assets/sounds/error.mp3',
  button: '/assets/sounds/button.mp3',
  turn: '/assets/sounds/turn.mp3'
};

class SoundManager {
  private enabled = this.readPreference();
  private readonly sounds = new Map<SoundName, HTMLAudioElement | null>();
  private readonly warned = new Set<SoundName>();

  constructor() {
    void this.preload();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    localStorage.setItem(SOUND_PREF_KEY, enabled ? 'true' : 'false');
  }

  play(name: SoundName): void {
    if (!this.enabled) {
      return;
    }

    const original = this.sounds.get(name);
    if (original === undefined) {
      void this.load(name);
      return;
    }
    if (original === null) {
      return;
    }

    const audio = original.cloneNode(true) as HTMLAudioElement;
    audio.volume = name === 'turn' ? 0.22 : 0.35;
    audio.play().catch(() => {
      this.warnMissing(name);
    });
  }

  private async preload(): Promise<void> {
    for (const name of Object.keys(SOUND_FILES) as SoundName[]) {
      await this.load(name);
    }
  }

  private async load(name: SoundName): Promise<void> {
    try {
      const response = await fetch(SOUND_FILES[name], { method: 'HEAD' });
      const length = Number(response.headers.get('content-length') ?? '0');
      if (!response.ok || length === 0) {
        this.warnMissing(name);
        this.sounds.set(name, null);
        return;
      }
      this.sounds.set(name, this.createAudio(name));
    } catch {
      this.warnMissing(name);
      this.sounds.set(name, null);
    }
  }

  private createAudio(name: SoundName): HTMLAudioElement {
    const audio = new Audio(SOUND_FILES[name]);
    audio.preload = 'auto';
    audio.addEventListener('error', () => this.warnMissing(name), { once: true });
    return audio;
  }

  private readPreference(): boolean {
    const saved = localStorage.getItem(SOUND_PREF_KEY);
    return saved === null ? true : saved === 'true';
  }

  private warnMissing(name: SoundName): void {
    if (this.warned.has(name)) {
      return;
    }
    this.warned.add(name);
    console.warn(`Sound asset unavailable: ${SOUND_FILES[name]}`);
  }
}

export const soundManager = new SoundManager();

export function getSoundEnabled(): boolean {
  return soundManager.isEnabled();
}

export function setSoundEnabled(enabled: boolean): void {
  soundManager.setEnabled(enabled);
}

export function playSound(name: SoundName): void {
  soundManager.play(name);
}
