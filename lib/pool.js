"use strict";

class SimplePool {
  constructor(options) {
    this.min = Math.max(0, Number(options.min || 0));
    this.max = Math.max(1, Number(options.max || 1));
    this.create = options.create;
    this.destroy = options.destroy;
    this.validate = options.validate;

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
      this.waiters.push({ resolve, reject });
    });
  }

  release(client) {
    if (!client || !this.busy.has(client)) {
      return;
    }
    this.busy.delete(client);

    const waiter = this.waiters.shift();
    if (waiter) {
      this.busy.add(client);
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

    const waiter = this.waiters.shift();
    if (waiter) {
      try {
        const replacement = await this.create();
        this.total += 1;
        this.busy.add(replacement);
        waiter.resolve(replacement);
      } catch (err) {
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
}

module.exports = SimplePool;

