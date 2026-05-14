import { useEffect, useMemo, useState } from 'react';
import { CARD_DEF_BY_ID } from '../../../shared/cardDefs';

type CardImageSize = 'small' | 'medium' | 'large';

interface CardImageProps {
  cardId?: string | null;
  hidden?: boolean;
  size: CardImageSize;
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

const CARD_BACK = '/assets/card-back-screw.png';

export function CardImage({ cardId, hidden, size, selectable, selected, onClick }: CardImageProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const asset = useMemo(() => {
    if (hidden) {
      return CARD_BACK;
    }
    if (!cardId) {
      return '';
    }
    return CARD_DEF_BY_ID[cardId]?.image ?? '';
  }, [cardId, hidden]);

  useEffect(() => {
    setLoadFailed(false);
  }, [asset]);

  const filename = asset.split('/').pop() || `${cardId ?? 'unknown'}.png`;
  const isMissing = loadFailed || !asset;
  const title = hidden ? 'Hidden card' : CARD_DEF_BY_ID[cardId ?? '']?.name ?? cardId ?? 'Card';

  return (
    <button
      aria-label={title}
      className={[
        'card-image',
        `card-image--${size}`,
        selectable || onClick ? 'is-selectable' : '',
        selected ? 'is-selected' : '',
        hidden ? 'is-hidden-card' : '',
        isMissing ? 'is-missing-asset' : ''
      ].join(' ')}
      disabled={!onClick}
      onClick={onClick}
      title={isMissing ? `Missing card asset: ${filename}` : title}
      type="button"
    >
      {isMissing ? (
        <span>Missing card asset: {filename}</span>
      ) : (
        <img alt={title} draggable={false} onError={() => setLoadFailed(true)} src={asset} />
      )}
    </button>
  );
}
