import { sanitizeInput, sanitizeObject } from '../input-sanitizer.util';

describe('sanitizeInput', () => {
  describe('pass-through for non-string values', () => {
    it('returns the input unchanged when it is null', () => {
      expect(sanitizeInput(null as any)).toBeNull();
    });

    it('returns the input unchanged when it is undefined', () => {
      expect(sanitizeInput(undefined as any)).toBeUndefined();
    });

    it('returns an empty string unchanged', () => {
      expect(sanitizeInput('')).toBe('');
    });
  });

  describe('clean input', () => {
    it('returns a plain string unchanged', () => {
      expect(sanitizeInput('Hello, World!')).toBe('Hello, World!');
    });

    it('preserves legitimate HTML tags (non-script)', () => {
      const html = '<p>Some <strong>text</strong></p>';
      expect(sanitizeInput(html)).toBe(html);
    });
  });

  describe('<script> tag removal', () => {
    it('strips a simple <script> tag', () => {
      expect(sanitizeInput('<script>alert("xss")</script>')).toBe('');
    });

    it('strips a <script> tag with attributes', () => {
      expect(sanitizeInput('<script type="text/javascript">alert(1)</script>text after')).toBe(
        'text after',
      );
    });

    it('strips multiple <script> tags', () => {
      const input = 'a<script>x()</script>b<script>y()</script>c';
      expect(sanitizeInput(input)).toBe('abc');
    });

    it('is case-insensitive for script tags', () => {
      expect(sanitizeInput('<SCRIPT>evil()</SCRIPT>')).toBe('');
    });
  });

  describe('inline event handler removal', () => {
    it('strips onclick handler with double quotes', () => {
      const result = sanitizeInput('<button onclick="evil()">Click</button>');
      expect(result).not.toContain('onclick');
    });

    it('strips onerror handler with single quotes', () => {
      const result = sanitizeInput("<img onerror='evil()' src='x'>");
      expect(result).not.toContain('onerror');
    });

    it('strips unquoted event handler', () => {
      const result = sanitizeInput('<img onload=evil()>');
      expect(result).not.toContain('onload');
    });
  });

  describe('javascript: URI removal', () => {
    it('strips javascript: from an anchor href', () => {
      const result = sanitizeInput('<a href="javascript:alert(1)">click</a>');
      expect(result).not.toContain('javascript:');
    });

    it('strips javascript: with extra whitespace', () => {
      const result = sanitizeInput('javascript  :void(0)');
      expect(result).not.toContain('javascript');
    });
  });

  describe('data: URI blocking', () => {
    it('blocks data: URIs in src attributes', () => {
      const result = sanitizeInput('<img src="data:image/png;base64,ABC">');
      expect(result).not.toContain('src="data:');
      expect(result).toContain('data_blocked:');
    });

    it('blocks data: URIs in href attributes', () => {
      const result = sanitizeInput('<a href="data:text/html,<script>x()</script>">link</a>');
      expect(result).not.toContain('href="data:');
    });
  });
});

describe('sanitizeObject', () => {
  it('sanitizes all string fields by default', () => {
    const obj = {
      name: 'Alice<script>evil()</script>',
      age: 30,
      bio: '<img onerror="hack()" src="x">',
    };

    const result = sanitizeObject(obj);

    expect(result.name).toBe('Alice');
    expect(result.age).toBe(30);
    expect(result.bio).not.toContain('onerror');
  });

  it('only sanitizes the specified fields when provided', () => {
    const obj = {
      title: '<script>evil()</script>Safe Title',
      description: '<script>also evil()</script>',
    };

    const result = sanitizeObject(obj, ['title']);

    expect(result.title).toBe('Safe Title');
    // description was NOT requested for sanitization — must stay untouched
    expect(result.description).toBe('<script>also evil()</script>');
  });

  it('does not mutate the original object', () => {
    const original = { name: '<script>x()</script>' };
    const result = sanitizeObject(original);

    expect(original.name).toBe('<script>x()</script>');
    expect(result.name).toBe('');
  });

  it('preserves non-string fields unchanged', () => {
    const obj = { count: 42, active: true, tags: ['a', 'b'] };
    const result = sanitizeObject(obj);

    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
    expect(result.tags).toEqual(['a', 'b']);
  });
});
