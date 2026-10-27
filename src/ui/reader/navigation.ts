import type { Location } from '../../core/domain/location';
import type { ReaderEngine } from '../../reader-engine/engine';
import { useReader } from '../stores/readerStore';
import { useStudy } from '../stores/studyStore';

/** Salta a una ubicación desde una hoja o popover: cierra todo y deja la píldora de volver. */
export function jumpTo(engine: ReaderEngine | null, location: Location): void {
  const reader = useReader.getState();
  reader.openSheet(null);
  reader.setChrome(false);
  useStudy.setState({ termPopover: null, toolbar: null });
  engine?.goTo(location, { recordJump: true }).catch(() => {});
}

export function jumpToBlock(engine: ReaderEngine | null, chapterId: string, blockId: string): void {
  jumpTo(engine, { chapterId, blockId, charOffset: 0 });
}
