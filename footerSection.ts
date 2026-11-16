import { fit } from '../core/math';
import { scrollManager } from '../core/ScrollPane';
import { footerScene } from '../scenes/footerScene';
import { siteHeader } from '../SiteHeader';
import { Section } from './Section';

// Source jsonp package (pretty 29168-29195), single-use subset.
let _jsonpCount = 0;
function jsonp(
  url: string,
  opts: { param?: string; timeout?: number },
  fn: (err: Error | null, data?: { result?: string; msg?: string }) => void,
): void {
  const prefix = '__jp';
  const id = prefix + _jsonpCount++;
  const param = opts.param || 'callback';
  const timeout = opts.timeout != null ? opts.timeout : 60000;
  const target = document.getElementsByTagName('script')[0] || document.head;
  let script: HTMLScriptElement;
  const timer = timeout
    ? setTimeout(() => {
        cleanup();
        fn(new Error('Timeout'));
      }, timeout)
    : null;
  function cleanup(): void {
    if (script.parentNode) script.parentNode.removeChild(script);
    (window as unknown as Record<string, unknown>)[id] = () => {};
    if (timer) clearTimeout(timer);
  }
  (window as unknown as Record<string, unknown>)[id] = (data: {
    result?: string;
    msg?: string;
  }) => {
    cleanup();
    fn(null, data);
  };
  url += (~url.indexOf('?') ? '&' : '?') + param + '=' + encodeURIComponent(id);
  url = url.replace('?&', '?');
  script = document.createElement('script');
  script.src = url;
  target.parentNode!.insertBefore(script, target);
}

const MAILCHIMP_URL =
  'https://lusion.us20.list-manage.com/subscribe/post?u=ea813c53ac6d7a0b76f2e36a1&amp;id=44b41b41bf&amp;v_id=4233&amp;f_id=001e18e7f0';
const getAjaxUrl = (url: string): string => url.replace('/post?', '/post-json?');
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export class NewsletterForm {
  isSendingRequest = false;
  domForm: HTMLFormElement;
  domInput: HTMLInputElement;
  domButton: HTMLButtonElement;
  domMessage: HTMLElement;

  constructor(
    form: HTMLFormElement,
    input: HTMLInputElement,
    button: HTMLButtonElement,
    message: HTMLElement,
  ) {
    this.domForm = form;
    this.domInput = input;
    this.domButton = button;
    this.domMessage = message;
    this.domForm.addEventListener('submit', this._onFormSubmit.bind(this));
  }

  private _onFormSubmit(e: Event): void {
    e.preventDefault();
    if (this.isSendingRequest) return;
    this._clearMessage();
    const email = new FormData(this.domForm).get('EMAIL') as string;
    if (!validateEmail(email)) {
      this._showError('Please enter a valid email address');
      this.domInput.setAttribute('aria-invalid', 'true');
      return;
    }
    this.domInput.setAttribute('aria-invalid', 'false');
    this.isSendingRequest = true;
    this._setLoadingState(true);
    // Source: toQueryString({EMAIL}) appended to the post-json URL.
    const url = getAjaxUrl(MAILCHIMP_URL) + '&EMAIL=' + encodeURIComponent(email).replace(/%20/g, '+');
    jsonp(url, { param: 'c' }, (err, data) => {
      console.log(data);
      if (err) {
        this._showError('Something went wrong, please try again');
      } else if (data!.result !== 'success') {
        this._showError('Something went wrong, please try again');
      } else {
        if (data!.msg && data!.msg.includes('already subscribed')) {
          this._showSuccess('You are already subscribed!');
        } else {
          this._showSuccess('Almost there! Check your inbox');
        }
        this.domForm.reset();
        setTimeout(() => {
          this._clearMessage();
        }, 5000);
      }
      this.isSendingRequest = false;
      this._setLoadingState(false);
    });
  }

  private _setLoadingState(loading: boolean): void {
    this.domButton.disabled = loading;
    this.domButton.setAttribute('aria-busy', loading ? 'true' : 'false');
  }

  private _showError(message: string): void {
    this.domMessage.textContent = message;
    this.domMessage.classList.add('is-error');
    this.domMessage.classList.remove('is-success');
    this.domMessage.setAttribute('role', 'alert');
  }

  private _showSuccess(message: string): void {
    this.domMessage.textContent = message;
    this.domMessage.classList.add('is-success');
    this.domMessage.classList.remove('is-error');
    this.domMessage.setAttribute('role', 'status');
  }

  private _clearMessage(): void {
    this.domMessage.textContent = '';
    this.domMessage.classList.remove('is-error', 'is-success');
    this.domMessage.removeAttribute('role');
  }
}

let _domLoveButton: HTMLButtonElement | null = null;
let _domLoveButtonChildren: HTMLCollection | never[] = [];
let _domLoveCopiedSpan: HTMLSpanElement | null = null;

export class FooterSection extends Section {
  newsletterForm: NewsletterForm | null = null;
  domInner!: Element;

  preInit(root: Element): void {
    super.preInit(root, 'footer');
    this.domInner = this.domContainer.querySelector('.section__inner') as Element;
    const form = document.getElementById('footer-newsletter-form') as HTMLFormElement | null;
    const input = document.getElementById('footer-email-input') as HTMLInputElement | null;
    const button = document.getElementById('footer-email-btn') as HTMLButtonElement | null;
    const message = document.getElementById('footer-newsletter-message');
    if (form && input && button && message) {
      this.newsletterForm = new NewsletterForm(form, input, button, message);
    }
    _domLoveButton = document.querySelector('#footer-love button');
    if (_domLoveButton) {
      _domLoveButton.addEventListener('click', () => {
        navigator.clipboard.writeText('https://oryzo.ai/');
        for (let i = 0; i < _domLoveButtonChildren.length; i++) {
          (_domLoveButtonChildren[i] as HTMLElement).style.display = 'none';
        }
        _domLoveCopiedSpan!.style.display = 'block';
        _domLoveButton!.classList.add('copied');
        setTimeout(() => {
          _domLoveButton!.classList.remove('copied');
        }, 500);
        setTimeout(() => {
          for (let i = 0; i < _domLoveButtonChildren.length; i++) {
            (_domLoveButtonChildren[i] as HTMLElement).style.display = 'inline-block';
          }
          _domLoveCopiedSpan!.style.display = 'none';
        }, 2000);
      });
    }
  }

  init(): void {
    super.init();
    _domLoveButtonChildren = _domLoveButton!.children;
    _domLoveCopiedSpan = document.createElement('span');
    _domLoveCopiedSpan.textContent = 'COPIED!';
    _domLoveCopiedSpan.style.display = 'none';
    _domLoveButton!.appendChild(_domLoveCopiedSpan);
  }

  resize(width: number, height: number): void {
    super.resize(width, height);
  }

  update(_dt: number): void {
    const range = scrollManager.getDomRange(this.domContainer);
    const hide = range.hideScreenOffset;
    footerScene.activeRatio = fit(hide, -2, -1, 0, 1);
    if (range.showScreenOffset > 0) siteHeader.changeNav('footer');
  }
}

export const footerSection = new FooterSection();