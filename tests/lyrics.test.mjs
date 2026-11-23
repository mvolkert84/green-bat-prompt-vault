import assert from 'node:assert/strict';
import test from 'node:test';
import {parseLyrics, activeLyric, stampLyric} from '../lyrics-sync.js';

test('offsets, repeated tags, ordering and exact seek boundaries', () => {
  const {lines, cues} = parseLyrics('[ar:Vertigo]\r\n[offset:+200]\n[00:07.0]Last\n[00:01.10][00:04.50]First\n[00:06.000]Next');
  assert.deepEqual(lines.map(x => x.line), ['First', 'First', 'Next', 'Last']);
  for (const [seconds, expected] of [[0, -1], [1.29, -1], [1.301, 0], [4.7, 1], [6.25, 2], [9, 3], [2, 0], [0.1, -1]]) {
    assert.equal(activeLyric(cues, seconds), expected);
  }
});

test('plain, empty, mixed, and gap lines remain intact', () => {
  assert.equal(parseLyrics('First line\nSecond line').text, 'First line\nSecond line');
  assert.deepEqual(parseLyrics('').cues, []);
  assert.deepEqual(parseLyrics('A [00:02] note in this text').cues, []);
  const parsed = parseLyrics('[00:01]First\nUnmarked text\n[00:03]\n[00:05]Last');
  assert.deepEqual(parsed.lines.map(x => x.line), ['First', 'Unmarked text', '', 'Last']);
  assert.equal(activeLyric(parsed.cues, 4), 2);
});

test('marking preserves text and later repeated timestamps', () => {
  const text = 'First\n[00:04.0][00:08]Second\nThird';
  const edit = stampLyric(text, 24, 13.25);
  assert.equal(text.slice(0, edit.start) + edit.value + text.slice(edit.finish), 'First\n[00:13.25][00:08]Second\nThird');
  assert.equal(stampLyric(text, 0, 0).value, '[00:00.00]First');
});
