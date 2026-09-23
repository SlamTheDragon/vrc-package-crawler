# Politeness Dynamics, Adaptive Rate Limiting, and RFC 9309 Protocol Compliance
This guide will define adaptive rate limiting algorithms, token bucket mechanics, RFC 9309 robots exclusion rules, and backoff jitter.

***

## 1. The Politeness Problem in Search Engine Crawling

Web crawlers will request documents from remote web servers. Without rate limiting, a fast crawler can fire hundreds of parallel connections at an origin host.

This burst traffic will cause server brownouts and will degrade performance for human users[^1]. In response, edge firewalls and load balancers will block the crawler with `HTTP 429 Too Many Requests` or `HTTP 403 Forbidden`.

A production crawler will enforce the **Politeness Invariant**:
- At most one request is in flight to any host at any given millisecond.
- Inter-request delays will match or exceed origin capacity.

```mermaid
flowchart TD
    A["URL Dequeued for Host"] --> B{"Is Host Ready? (Now >= NextFetchTime)"}
    B -- "No" --> C["Sleep Until NextFetchTime"]
    B -- "Yes" --> D["Transmit HTTP Request with Conditional Headers"]
    D --> E{"Inspect Payload & Status Code"}
    E -- "Cloudflare Challenge (HTTP 200 Trap)" --> H["Halt Speedup & Enter Quarantine"]
    E -- "200 OK / 304 Not Modified" --> F["Additive Delay Decrease (Speed Up)"]
    E -- "429 Rate Limited / 503 Busy" --> G["Multiplicative Delay Increase (Backoff)"]
```

---

## 2. Token Bucket and Leaky Bucket Algorithms

System designers will use bucket algorithms to regulate request flow[^2].

```mermaid
graph LR
    subgraph Token Bucket
        T1["Token Generator (r tokens/sec)"] --> T2["Bucket (Capacity B)"]
        T2 --> T3["Consume 1 Token per Request"]
    end
```

### The Token Bucket Model
A token bucket will permit small bursts while maintaining a strict average rate:
- Tokens will accumulate in a bucket of capacity $B$ at rate $r$ tokens per second.
- To send an HTTP request, the worker will consume one token.
- If the bucket is empty, the worker will wait for the next token.

For storefronts like BOOTH and Gumroad, the crawler will set capacity $B = 1$ and rate $r \le 0.33$ requests per second (at least 3.0 seconds between requests). Setting $B = 1$ will eliminate burst traffic entirely.

### The Leaky Bucket Model
A leaky bucket will buffer requests in a FIFO queue and will release them at a constant speed. This algorithm will eliminate request clumps. It will produce a smooth stream of outgoing packets.

---

## 3. Adaptive Congestion Control: AIMD and Poisson Freshness

Static delays cannot adapt to dynamic server load. The crawler will adapt request rates using **Additive Increase / Multiplicative Decrease (AIMD)**[^3].

### Additive Increase (Normal Health)
When the server returns successful status codes (`HTTP 200 OK` or `HTTP 304 Not Modified`), the crawler will slightly decrease delay:

$$T_{\text{delay}} = \max\left(T_{\min}, T_{\text{delay}} - \delta\right)$$

- $T_{\min}$: Absolute floor (such as 1,000 milliseconds for storefronts, 200 milliseconds for GitHub raw CDN).
- $\delta$: Additive reduction step (such as 50 milliseconds).

### Multiplicative Decrease (Congestion Detected)
When the server returns `HTTP 429 Too Many Requests` or `HTTP 503 Service Unavailable`, the crawler will multiply the delay:

$$T_{\text{delay}} = \min\left(T_{\max}, T_{\text{delay}} \times \beta\right)$$

- $\beta$: Multiplicative backoff factor (standard: $\beta = 2.0$).
- $T_{\max}$: Maximum delay ceiling (such as 300,000 milliseconds or 5 minutes).

### The Cloudflare Managed Challenge Acceleration Trap
Edge firewalls like Cloudflare Turnstile return `HTTP 200 OK` containing an interactive HTML challenge payload. 

An uninspected crawler will interpret `HTTP 200` as successful content delivery. Under naive AIMD or Poisson scheduling, the crawler will accelerate request frequency ($\lambda \times 1.4$). This causes the crawler to accelerate directly into an IP ban.

The crawler will inspect response payloads for challenge signatures (`cf-mitigated: challenge`, `challenges.cloudflare.com/turnstile`) before calculating freshness. When detected, the engine will halt acceleration immediately and will mark the host as constrained.

### Adaptive Poisson Re-Crawling and Conditional Headers
The engine will schedule document revisits based on the Cho-Garcia-Molina Poisson distribution model[^4]. The scheduler will maintain index freshness while respecting domain request quotas:
1. **Frontier Re-Queuing**: The crawler daemon will periodically invoke `requeueStaleUrls()` during idle monitor intervals.
2. **Conditional HTTP Requests**: Crawl drivers will transmit `If-None-Match` (ETag) and `If-Modified-Since` headers.
3. **Freshness Feedback**: When an origin responds with `HTTP 304 Not Modified`, the worker will update metadata without re-downloading the body. It will invoke:
   ```typescript
   poissonScheduler.adjustAfterFetch(url, isModified, etag, lastModifiedHeader);
   ```
   This will compute the next fetch interval dynamically instead of applying a rigid 24-hour constant.

### Exponential Backoff with Decorrelated Jitter
When multiple crawler workers run simultaneously, synchronized retry loops will create thundering herd problems. Adding randomized jitter will break synchronization[^5].

$$\Delta \tau = \text{random\_between}\left(T_{\min}, T_{\text{delay}} \times 3\right)$$

Random jitter will spread requests across the timeline, allowing the origin server to recover smoothly.

---

## 4. RFC 9309 Robots Exclusion Protocol Compliance

In September 2022, the IETF published RFC 9309 as the official Internet standard for `robots.txt`[^6].

```mermaid
flowchart TD
    R1["Fetch /robots.txt"] --> R2{"Status Code"}
    R2 -- "200 OK" --> R3["Parse Rules and Cache for 24h"]
    R2 -- "404 Not Found" --> R4["Allow All Paths"]
    R2 -- "5xx Server Error" --> R5["Full Disallow (Fail-Safe Polite)"]
    R3 --> R6["Match Request Path: Longest Prefix Wins"]
```

### Parsing Invariants under RFC 9309
A compliant crawler will obey these formal standard rules:

1. **Location and Name**:
   The exclusion file must reside at `/robots.txt` in the root of the URI authority. The filename must be all lowercase.
2. **User-Agent Matching**:
   The crawler will match product-specific product tokens (such as `VRCDiscoveryBot`). If no specific group matches, the crawler will fall back to the wildcard group (`User-agent: *`).
3. **Longest Prefix Matching Rule**:
   When both `Allow` and `Disallow` rules match a path, the rule with the longer character length takes precedence:
   - `Allow: /items/free/` (12 characters)
   - `Disallow: /items/` (8 characters)
   - Result: `/items/free/model.json` is allowed.
4. **Cache Lifetime**:
   Crawlers will refresh `/robots.txt` entries within 24 hours. If an origin server returns `HTTP 5xx`, the crawler will treat the entire site as disallowed until the server recovers.

***

## References

[^1]: A. Heydon and M. Najork, "Mercator: A scalable, extensible Web crawler," *World Wide Web*, vol. 2, no. 4, pp. 219-229, Dec. 1999.

[^2]: J. S. Turner, "New directions in communications (or which way to the information age?)," *IEEE Communications Magazine*, vol. 24, no. 10, pp. 8-15, Oct. 1986.

[^3]: V. Jacobson, "Congestion avoidance and control," in *Proc. ACM SIGCOMM '88 Symp. Communications Architectures and Protocols*, Stanford, CA, USA, 1988, pp. 314-329.

[^4]: J. Cho and H. Garcia-Molina, "The Evolution of the Web and Implications for an Incremental Crawler," in *Proc. 26th Int. Conf. Very Large Data Bases (VLDB)*, Cairo, Egypt, 2000, pp. 200-209.

[^5]: Amazon Web Services, "Exponential Backoff And Jitter," AWS Architecture Blog, 2015. [Online]. Available: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/

[^6]: M. Koster, G. Illyes, H. Zeller, and L. Sassman, "Robots Exclusion Protocol," IETF Standards Track RFC 9309, Sep. 2022. [Online]. Available: https://www.rfc-editor.org/info/rfc9309
