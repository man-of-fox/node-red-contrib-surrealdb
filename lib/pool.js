"use strict";

class SimplePool {
  constructor(options) {
    this.min = Math.max(0, Number(options.min || 0));
    this.max = Math.max(1, Number(options.max || 1));
    this.create = options.create;
    this.destroy = options.destroy;
    this.validate = options.validate;
    this.acquireTimeoutMs = Math.max(0, Number(options.acquireTimeoutMs || 0));

    this.available = [];
    this.busy = new Set();
    this.waiters = [];
    this.total = 0;
  }

  async initialize() {
    for (let i = 0; i < this.min; i += 1) {
      const client = await this.create();
      this.available.push(client);
      this.total += 1;
    }
  }

  async acquire() {
    while (this.available.length > 0) {
      const client = this.available.pop();
      if (!this.validate || (await this.validate(client))) {
        this.busy.add(client);
        return client;
      }
      await this._destroyOne(client);
    }

    if (this.total < this.max) {
      const client = await this.create();
      this.total += 1;
      this.busy.add(client);
      return client;
    }

    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      if (this.acquireTimeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) {
            this.waiters.splice(index, 1);
          }
          reject(new Error(`Pool acquire timed out after ${this.acquireTimeoutMs}ms`));
        }, this.acquireTimeoutMs);
      }
      this.waiters.push(waiter);
    });
  }

  release(client) {
    if (!client || !this.busy.has(client)) {
      return;
    }
    this.busy.delete(client);

    const waiter = this._takeNextWaiter();
    if (waiter) {
      this.busy.add(client);
      this._clearWaiterTimer(waiter);
      waiter.resolve(client);
      return;
    }

    this.available.push(client);
  }

  async destroyClient(client) {
    if (!client) {
      return;
    }
    this.busy.delete(client);
    this.available = this.available.filter((c) => c !== client);
    await this._destroyOne(client);

    const waiter = this._takeNextWaiter();
    if (waiter) {
      try {
        const replacement = await this.create();
        this.total += 1;
        this.busy.add(replacement);
        this._clearWaiterTimer(waiter);
        waiter.resolve(replacement);
      } catch (err) {
        this._clearWaiterTimer(waiter);
        waiter.reject(err);
      }
    }
  }

  async drain() {
    const all = [...this.available, ...Array.from(this.busy)];
    this.available = [];
    this.busy.clear();

    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      this._clearWaiterTimer(waiter);
      waiter.reject(new Error("Pool is shutting down"));
    }

    await Promise.all(all.map((client) => this._destroyOne(client)));
  }

  async _destroyOne(client) {
    try {
      await this.destroy(client);
    } finally {
      this.total = Math.max(0, this.total - 1);
    }
  }

  _takeNextWaiter() {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (waiter) {
        return waiter;
      }
    }
    return null;
  }

  _clearWaiterTimer(waiter) {
    if (waiter && waiter.timer) {
      clearTimeout(waiter.timer);
      waiter.timer = null;
    }
  }
}

module.exports = SimplePool;
