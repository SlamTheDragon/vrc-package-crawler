export interface DriverRuntime {
  readonly isAborted: boolean;
  sleep(ms: number): Promise<void>;
}

export class AbortableDriverRuntime implements DriverRuntime {
  public isAborted = false;

  abort() {
    this.isAborted = true;
  }

  reset() {
    this.isAborted = false;
  }

  async sleep(ms: number) {
    const end = Date.now() + ms;
    while (!this.isAborted && Date.now() < end) {
      const wait = Math.min(100, end - Date.now());
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}
