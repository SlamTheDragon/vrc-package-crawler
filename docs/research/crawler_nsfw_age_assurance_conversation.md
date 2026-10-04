**Crawler NSFW / Age-Assurance Architecture**

*Conversation transcript*

October 4, 2026

> This document preserves the visible conversation in this chat thread through the user’s export request. Speaker labels and code blocks are retained; source links from assistant replies are written as ordinary URLs.

User

with the crawler nearing its backend staging I've faced a really moral and legal obligation that I need to decide as soon as possible that will greatly align the future LEGAL.md

The crawler has a high chance of being able to crawl NSFW sold items from gumroad, jinxxy, booth, and whatever storefront is being crawled.

The problem:

- this is a free service still, but should the platform have a separate nsfw tag for such indexed listing?

\- technically, the obvious answer would be yes, but this opens a lot of other questions:

- Should the user even be authenticated to see such packages?

- Should we even bother trying to obtain government ID to verify their DoB?

- Should we even begin verifying user ages?

- Should we just imply account age from their emails?

- Should we use their canonical VRChat profile data using 3rd party services or unofficial (potentially ToS-breaking) API to fetch profile age-verified status?

- Should NSFW content be gatekept?

- Should we just lazily accept that we really don't have a good way to filter out these items and add a huge disclaimer warning before site entry?

The other big problem is that some or most storefront products don't even explicitly state a product could be actually nsfw, other than some potentially confusing wording that the general population knows about but a really hard thing to catch if a crawler fetches it and can perform miscategorization.

The other solution is to train a small neural model to distinguish between these items (including thumbnails), which technically would break legal covenants considering what and where this project aims to place itself.

The other last resort is to force trusted volunteers to sit at their computer endlessly sifting through crawled candidates.

All paths have pros and cons, and also worth to point out that all of these would result on major backlash/being blacklisted. We really don't have a good solution to this yet

Assistant

Yeah — I think this needs to become a **core architectural rule**, not merely an NSFW checkbox.

The key distinction I would make is:

> **The crawler may discover adult material, but discovery does not automatically grant permission to publish or expose that material.**

That separation solves a surprising amount of the problem.

## What I would do

I would **not** make the crawler itself an identity-verification service.

I would also **not**:

- collect government IDs yourself;

- infer age from an email address;

- infer age from account creation dates;

- scrape someone's VRChat account for an age-verification flag;

- depend on unofficial VRChat APIs;

- assume "I am 18+" is equivalent to legal age assurance;

- expose everything and rely on a warning page.

The last option is especially risky for you because of Philippine law. RA 11930 §35 says that online providers of adult content must adopt an **anonymous age-verification process before granting access to adult content**. Whether your particular metadata search engine ultimately qualifies as an "online provider of adult content" is something I'd want actual Philippine counsel to interpret, because indexing/linking is not identical to operating a porn site. But designing as though unrestricted explicit listings were harmless would be a bad bet.

Source: https://lawphil.net/statutes/repacts/ra2022/ra_11930_2022.html

At the same time, DOB and especially government-ID data are dangerous things for your tiny project to possess. Under the Philippine Data Privacy Act, **age itself is sensitive personal information**, as are government-issued identifiers.

Source: https://privacy.gov.ph/data-privacy-act-/

So I would intentionally design the crawler so that it **never needs to know someone's identity or exact birthday**.

# Separate classification from authorization

This is probably the most important architectural decision.

Instead of:

product.is_nsfw = true

I'd model something closer to:

content_rating  
GENERAL  
MATURE  
SEXUAL_SUGGESTIVE  
ADULT_RESTRICTED  
UNKNOWN_RESTRICTED  
PROHIBITED

And independently:

rating_source  
STOREFRONT  
CREATOR  
CRAWLER_RULE  
MODERATOR  
REPORT

Possibly also:

rating_confidence

and:

rating_reason

So something can be:

content_rating = ADULT_RESTRICTED  
rating_source = STOREFRONT  
rating_reason = "BOOTH R-18 designation"

without the crawler pretending that it independently determined that something is pornographic.

That provenance is important.

# Storefront classifications should be authoritative signals

Interestingly, the storefronts already solve part of your problem.

**Jinxxy**

Jinxxy currently distinguishes:

- General Mature Content

- Violence/Horror

- Sexually Suggestive Content

and requires sellers to classify applicable products. Users must have an account, provide DOB, and opt into adult content to view it. Explicit sexual content itself is prohibited under its current Mature Content Policy.

Source: https://support.jinxxy.com/hc/en-us/articles/16765872965517-Mature-Content-Policy

So your crawler shouldn't try to outsmart Jinxxy.

If Jinxxy says:

sexually_suggestive

retain:

source_classification = sexually_suggestive  
source = jinxxy

**BOOTH**

BOOTH is even better for this.

Its sellers are explicitly required to mark qualifying products R-18, and BOOTH can forcibly reclassify a listing as R-18 itself.

Source: https://booth.pm/guidelines

So:

BOOTH R-18  
↓  
crawler ADULT_RESTRICTED

should be almost mechanical.

Do **not** reinterpret the product yourself unless there's some contradiction worth flagging.

There's another useful precedent here: BOOTH itself acknowledges that these judgments aren't trivially deterministic. Its moderation can consider appearance, clothes, objects and text, and even saying a fictional character is an adult doesn't necessarily settle whether something may constitute child-sexual-abuse material.

Source: https://booth.pixiv.help/

That alone is a strong argument **against you building a home-grown visual NSFW classifier and declaring its output authoritative.**

**Gumroad**

Gumroad is a strange edge case.

It still documents an NSFW discovery toggle, where NSFW products only appear for users who opt into adult content.

Source: https://gumroad.com/help/article/79-gumroad-discover

But its prohibited-products policy, revised September 16, 2026, prohibits "sexually-oriented or pornographic content."

Source: https://gumroad.com/prohibited

That means you shouldn't conclude:

Gumroad NSFW == pornography

or:

Gumroad product == safe because pornography is prohibited

Instead preserve whatever first-party classification exists.

# The hard case: storefront says nothing

This is where I think your current mental dead-end comes from.

You don't actually need to answer:

> "Is this definitely pornography?"

The crawler can instead answer:

> "Do I have enough trustworthy information to safely publish this listing?"

Those are very different questions.

I'd introduce this state:

UNKNOWN_RESTRICTED

For example:

Listing discovered  
│  
├─ storefront says R-18/adult  
│ ↓  
│ ADULT_RESTRICTED  
│  
├─ storefront explicitly says general  
│ ↓  
│ GENERAL  
│  
└─ suspicious metadata / uncertain  
↓  
UNKNOWN_RESTRICTED

And UNKNOWN_RESTRICTED is **not publicly shown as adult content**.

Instead, suppress its risky fields until resolved.

Something like:

Title maybe shown  
Creator shown  
Storefront shown  
Canonical URL optionally shown  
Explicit preview NO  
Description sanitized/withheld  
Thumbnail withheld  
Search indexing restricted

That is a much safer failure mode than:

classifier wasn't sure → show it anyway

# You don't need volunteers endlessly reviewing products

This is another important consequence.

Humans shouldn't be in the normal ingestion loop.

They should only see **exceptions**.

┌─ GENERAL → publish  
source declaration ──┤  
├─ ADULT → restricted pipeline  
│  
└─ UNKNOWN  
│  
deterministic rules  
│  
┌─────────┴─────────┐  
↓ ↓  
high confidence ambiguous  
restricted │  
↓  
human review queue

That changes:

> "volunteers inspect 100,000 packages"

into:

> "volunteers inspect 30 unusual disagreements."

And creator claims/reports could resolve many of those without moderator involvement.

# I would avoid the neural classifier

Not primarily because neural networks are inherently legally forbidden.

The bigger issue is that it clashes with what you're building philosophically.

You'd introduce:

- an ML model;

- training data provenance;

- potentially copyrighted thumbnails used as training input;

- model biases;

- false-positive sexual classifications;

- false-negative adult content;

- possible child-safety classification errors;

- infrastructure and maintenance;

- explanations for why something was categorized;

- another major policy surface in LEGAL.md.

And if your legal covenant intentionally distances the project from AI training/use, you're creating a very awkward exception:

> "You may not use our dataset for AI, but we ingest everyone else's material into our AI classification system."

Even if legally defensible, that is **terrible optics**.

I wouldn't do it.

# Deterministic detection is different

You can still perform ordinary parsing.

For example, detecting:

R18  
R-18  
18+  
NSFW  
adult  
mature  
sexually suggestive

isn't a neural classifier.

Your crawler can also inspect structured data, CSS labels, tags, categories, storefront API fields, page metadata, etc.

And your architecture can keep **evidence** rather than claiming knowledge:

ratingEvidence: \[  
{  
source: "booth",  
type: "source_label",  
value: "R-18"  
}  
\]

That's far easier to defend.

# Don't use someone's email to infer age

I would explicitly prohibit this in LEGAL.md and architecture documentation.

An email tells you almost nothing reliable about age.

Even something like:

account created in 2007

doesn't prove:

account owner was alive in 2007

much less that the current user is the original owner.

It's also precisely the kind of behavioral inference regulators are becoming suspicious of.

Ofcom's 2026 review goes even further: it says age inference may be inadequate for certain statutory age restrictions because it only becomes possible after observing someone's activity for enough time.

Source: https://www.ofcom.org.uk/online-safety/protecting-children/use-of-age-assurance-report-2026

So:

age inference ≠ age verification

# Don't use VRChat age verification as your identity oracle

I would strongly avoid this.

Even if VRChat exposes some status like:

ageVerified: true

through an unofficial endpoint someday, you'd now be coupling:

Crawler account  
↓  
third-party account  
↓  
VRChat identity  
↓  
sensitive age status

That creates privacy concerns, API/ToS dependency, authentication complexity, impersonation/account-linking problems, breach consequences, dependency on VRChat policy, and questions about whether you're permitted to repurpose VRChat's verification result.

And it doesn't help users without VRChat accounts.

It also means a package search engine suddenly needs to know **who the person really is**, which is precisely what I'd avoid.

# If real age assurance becomes necessary, outsource it

The crawler should ideally receive something like:

over18 = true

not legal identity details.

Even better would be a signed assertion:

AgeCredential {  
threshold: 18,  
satisfied: true,  
issuer: "...",  
expires: ...  
}

Your server verifies the credential and records:

adult_access = true

without ever receiving the underlying ID.

That's exactly the direction regulators are moving toward.

The EU's age-verification architecture is specifically being designed around proving **"over 18" without unnecessarily revealing identity**, and its age-verification blueprint became feature-ready in April 2026.

Source: https://digital-strategy.ec.europa.eu/en/policies/eu-age-verification

And the Philippine statute itself interestingly uses the wording **anonymous age verification**.

So philosophically:

prove AGE PROPERTY  
not  
prove IDENTITY

is probably the right direction.

# Should an account be required?

I don't think an account should necessarily be required for the crawler in general.

For adult-restricted results, you could eventually have:

anonymous user  
↓  
age assurance provider  
↓  
opaque credential  
↓  
crawler session  
↓  
adult_access = true

No crawler account required.

If an account exists, you might bind the verification to that account to reduce repeated verification, but that's an implementation detail.

The crucial thing is:

> authentication and age assurance should remain separate concepts.

authenticated ≠ adult  
adult ≠ identified

# What should unauthenticated users actually see?

I would be conservative. For an adult-restricted listing, show only a restricted placeholder and do not deliver explicit thumbnails or descriptions before assurance. Importantly, don't display an explicit thumbnail behind a CSS blur; if the browser receives the image, it has received the explicit image.

# This also applies to your API

The restriction has to live at the data-access layer so downstream consumers cannot bypass the website restriction via the API.

# There's another category above NSFW

For suspected CSAEM/CSAM or other clearly illegal sexual material, do **not** treat it as ordinary NSFW = true. Use a distinct prohibited/special-incident path and obtain actual legal advice before finalizing retention, logging, moderator access, and reporting procedures.

# Global exposure complicates this further

The Philippines isn't the only reason to build it conservatively. The UK, EU, and parts of the US have moved toward stronger age assurance for qualifying sexually explicit material.

# So my proposed crawler policy would be

\| Situation \| Crawler behavior \|

\|---\|---\|

\| Source explicitly says general \| Normal indexing \|

\| Source says mature but nonsexual \| Mature tag \|

\| Source says sexually suggestive \| Restricted/sensitive classification \|

\| Source says R-18/Adult \| Adult-restricted \|

\| Source is ambiguous \| \`UNKNOWN_RESTRICTED\` \|

\| Explicit thumbnail \| Don't expose before age assurance \|

\| Uncertain thumbnail \| Don't expose until resolved \|

\| User reports misclassification \| Re-evaluate evidence \|

\| Creator claims listing \| Allow classification evidence/correction \|

\| Strong illegal-content indicators \| \`PROHIBITED\`, separate incident process \|

\| No useful source signals \| Fail closed rather than fail open \|

I'd also avoid nsfw as the sole field and instead use content_rating, content_warning\[\], and access_restriction.

The bigger philosophical answer is that the crawler doesn't need to become the **arbiter of what is pornographic**. Its job can instead be to preserve authoritative classifications where available, conservatively restrict uncertain material, expose why a classification exists, and provide correction/appeal mechanisms.

**中文简述：** 爬虫可以发现成人内容，但是“发现”不应该自动等于“公开显示”。

**Pinyin:** Pá chóng kěyǐ fāxiàn chéngrén nèiróng, dànshì “fāxiàn” bù yīnggāi zìdòng děngyú “gōngkāi xiǎnshì”.

The safest model is **source classification → conservative quarantine → age-restricted access**, rather than trying to identify every user's real identity.

**最安全的方式是：来源分类 → 保守隔离 → 年龄限制访问，而不是确认每个用户的真实身份。**

**Pinyin:** Zuì ānquán de fāngshì shì: láiyuán fēnlèi → bǎoshǒu gélí → niánlíng xiànzhì fǎngwèn, ér bú shì quèrèn měi gè yònghù de zhēnshí shēnfèn.

Common words: **年龄 (niánlíng)** = age; **验证 (yànzhèng)** = verification; **限制 (xiànzhì)** = restriction; **来源 (láiyuán)** = source/provenance; **隔离 (gélí)** = isolate/quarantine.

User

Hmm i was thinking more of how would the downstream apps should handle their responsibilities, other than the crawler. One thing to note is that the community do trust and use VRChat's profile identity to judge if someone has proven they are at consenting age, without having to ask for legally identifying DoB, since it has been done. Or use oauth apps which have services that offer age verification.

The single strangest thing is that VRChat ecosystem is heavily debated to turn into a mature-only place while the VRChat Inc. team actively pushes this platform to kids or teens, which creates friction because the amount of adult content supercedes normal content. I'm curious as to how a social media platform like twitter handle explicit contents, as I never really encountered age-verifying blocks. Some services try to track your activity to determine what age group you are. Discord, recently have been making moves like this similarly

As for the downstream app responsibility, I'm really not sure yet. Here's the thing, the whole platform is meant to be user-driven. Feedback comes in free, but when nsfw content is introduced, then you obviously can't just ask people in the public if such listing is explicitly rated or not. Noise will be forever be a problem for crawlers, but this introduces a unique gap on how feedback should be performed between explicit content and normal content in downstream apps, how the crawler network/worker should treat this, and what legal implications should be followed. Weird thing is that pornographic sites don't even ask for your age, they just let you press "I am 18 and above" them you're granted into the site

Assistant

Yeah — with the downstream apps in view, I’d frame this differently:

**the crawler should classify and transmit risk; downstream apps should decide whether they are allowed to render it to a particular user.**

That gives you a much cleaner responsibility boundary.

Storefront  
↓  
Crawler  
├─ discovers listing  
├─ stores source rating / evidence  
├─ marks uncertainty  
└─ emits access requirements  
↓  
Downstream app  
├─ decides what to show  
├─ performs/outsources age assurance  
├─ controls feedback eligibility  
└─ accepts local legal responsibility

The important bit is that the crawler should not say:

this user may see porn

It should say something more like:

{  
"content_rating": "ADULT_RESTRICTED",  
"required_age": 18,  
"rating_confidence": "SOURCE_ASSERTED",  
"rating_source": "booth:R-18"  
}

The consumer makes the final access decision.

## VRChat's verification actually fits this model quite well

VRChat’s own age assurance uses Persona, and verified 18+ users can have a Verified 18+ marker and enter age-gated instances. VRChat itself therefore already treats "VRChat has verified this account as 18+" as a useful **age assertion**, without another community member needing the person's DOB or ID.

Source: https://wiki.vrchat.com/wiki/Age_Assurance/en

That is conceptually the same architecture I would recommend for downstream crawler apps.

A downstream app should be allowed to trust a third party saying:

subject X satisfies age \>= 18

provided it knows **who issued that assertion and how trustworthy it is**.

So you might eventually define:

interface AgeAssurance {  
provider: string;  
level: "self_declared" \| "inferred" \| "verified";  
threshold: 18;  
verifiedAt?: string;  
}

Possible providers could include VRChat, Discord, OAuth providers, specialized age-assurance providers, or a local downstream implementation.

The crawler itself doesn't necessarily need to support or endorse those integrations.

## But I'd be careful about VRChat profile scraping

There's an important difference between a user deliberately signing into an app using some supported VRChat identity mechanism and a downstream app secretly querying an unofficial API and noticing an 18+ badge.

The first is much healthier architecturally.

If some future VRChat-supported authentication or delegated assertion can prove VRChat account 123 → Verified 18+, great.

If the only way is scraping profiles or calling endpoints VRChat doesn't intend third parties to use, I wouldn't make **that particular mechanism** part of the crawler specification.

You can instead make the protocol neutral:

adult_access_assertion  
issuer  
assurance_level  
expiry

Then applications can decide which issuers they trust.

## X is actually much closer to your proposed model now

Your memory of Twitter letting you click through sensitive-content warnings is basically accurate for its older model.

But as of October 2026, X has moved beyond that in places where regulation requires it.

X says it may determine age using email-based estimation, phone-based estimation, facial age estimation, or government-ID verification. If X cannot determine that someone meets the relevant age threshold, they may be unable to access sensitive media.

Source: https://help.x.com/en/rules-and-policies/age-assurance

X still uses sensitive-content warnings, but the warning is one UX layer, not necessarily the age verification itself.

Source: https://help.x.com/en/rules-and-policies/adult-content

## Discord is probably the closest precedent for your ecosystem

Discord now automatically assigns many accounts an age group using signals such as how long the account has existed and what kinds of servers it participates in. Discord says it does **not** read messages or calls for this purpose. If its model determines the account is an adult, most users never see a manual verification step.

Source: https://discord.com/blog/safer-for-teens-same-discord-for-adults

Discord escalates verification when someone tries to cross an **adult-content boundary**, such as entering an 18+ server or unblurring sensitive media.

Source: https://support.discord.com/hc/en-us/articles/30326565624343-How-to-Complete-Age-Assurance-on-Discord

And Discord's newer verification design deliberately tries to receive only the age result rather than the underlying ID.

That is probably a very good reference design for your downstream ecosystem.

# Downstream apps could therefore have assurance tiers

Rather than requiring one universal method, define **capability levels**:

AGE_UNKNOWN  
AGE_SELF_DECLARED_18_PLUS  
AGE_INFERRED_18_PLUS  
AGE_VERIFIED_18_PLUS

And then the listing might specify a minimum assurance. The downstream decides which verification mechanisms qualify.

The network policy could say:

> Applications exposing age-restricted representations are responsible for implementing age assurance appropriate to their applicable jurisdiction.

That's much more future-proof than prescribing a single provider.

# Now the interesting part: user-driven moderation

Ordinary listings can ask anyone whether a listing is incorrectly categorized. But once you have something potentially explicit, you can't safely expose the product to random users **in order to determine whether you're allowed to expose it to random users.** That's circular.

So feedback needs **visibility-aware permissions**.

GENERAL LISTING  
↓  
public feedback permitted  
  
MATURE / UNKNOWN  
↓  
feedback requires mature-content eligibility  
  
ADULT_RESTRICTED  
↓  
feedback only from adult-assured users  
  
PROHIBITED/SUSPECTED ILLEGAL  
↓  
no crowdsourced classification  
↓  
special reporting/moderation path

People don't necessarily need to see explicit material to report metadata errors. An unauthenticated user can report a broken URL, wrong creator, wrong title, duplicate listing, or product removal. But a report saying "This product is not actually adult content" should probably require an adult-assured reviewer or verified creator/owner.

So feedback itself can be typed:

enum ReportScope {  
METADATA,  
AVAILABILITY,  
OWNERSHIP,  
CONTENT_RATING,  
ILLEGAL_CONTENT,  
}

with a required capability for each report scope.

# You could even make feedback privacy-preserving

For example, a downstream app submits:

{  
"listing": "abc123",  
"report": "CONTENT_RATING_INCORRECT",  
"reviewer_capability": "ADULT_ASSURED"  
}

The crawler doesn't need DOB, passport, face, or legal name. The downstream signs the assertion that the reporter satisfied its adult-access policy.

That is very similar to the cryptographic delegation problem you were talking about earlier.

# But there should be accountability for downstream apps

Otherwise somebody could build a downstream whose ageCheck() always returns true and still consume restricted data.

So the network needs both **data classification** and **consumer trust level**.

A downstream consumer requesting adult-restricted fields might need stronger token scopes:

catalog.read  
catalog.restricted.read  
catalog.restricted.feedback

Obtaining restricted scopes could require agreeing to additional consumer terms, such as responsibility for lawful age-access controls and a prohibition against intentionally stripping or falsifying crawler-supplied content restrictions.

# This changes how the worker treats downstream feedback

You probably don't want 100 random votes to downgrade adult content to general. Instead, feedback becomes **evidence**.

For example:

SOURCE ASSERTION:  
BOOTH says R-18  
  
DOWNSTREAM REPORT:  
FooApp says creator claims General  
  
CREATOR ASSERTION:  
claimed owner says General  
  
MODERATOR REVIEW:  
adult-assured reviewer says Adult

Then the crawler evaluates provenance rather than raw majority voting. Feedback should never silently delete provenance.

# Adult sites are the historical oddball

Your observation about \[I am 18+\] being enough on many porn sites is real historically, but it does **not** mean self-declaration is legally sufficient everywhere.

The Philippines' RA 11930 specifically states that online providers of adult content must adopt an **anonymous age verification process before granting access**.

Source: https://lawphil.net/statutes/repacts/ra2022/ra_11930_2022.html

So I wouldn't design the ecosystem around a naked self-declaration as the universal compliance solution.

# I think your downstream contract eventually wants something like this

> **Restricted Content Responsibility**

\>

> The crawler may classify certain records or representations as age-restricted. Applications consuming restricted records are responsible for implementing appropriate access controls before displaying restricted representations.

\>

> Consumers must not remove, bypass, falsify, or knowingly downgrade crawler-supplied restriction metadata without sufficient evidence.

\>

> Consumer applications may implement age assurance directly or rely upon trusted third-party assertions. The crawler does not require consumers to collect or disclose users' government identities.

\>

> Feedback requiring inspection of restricted material must only be solicited from users authorized by the downstream application to access that material.

\>

> The crawler may accept such feedback as evidence but does not necessarily treat downstream classification as authoritative.

The useful mental model is **three separate trust graphs**:

CONTENT TRUST  
Who says this thing is adult?  
  
IDENTITY/AGE TRUST  
Who says this person is an adult?  
  
DOWNSTREAM TRUST  
Who says this application enforced the rule?

They don't need to be the same entity.

**内容分类和年龄验证应该分开。**

\*Nèiróng fēnlèi hé niánlíng yànzhèng yīnggāi fēnkāi.\*

Content classification and age verification should be separate.

**下游应用负责决定用户是否可以查看限制内容。**

\*Xiàyóu yìngyòng fùzé juédìng yònghù shìfǒu kěyǐ chákàn xiànzhì nèiróng.\*

The downstream application is responsible for deciding whether a user can view restricted content.

A useful next step would be turning those **three trust graphs** into the actual crawler API/token architecture, because they map unusually well onto the cryptographic delegation system you're already designing.

User

what would be your opinions about using VRChat's user profile data to prove someone's age? VRChat doesn't explicitly allow this, but there are so many 3rd party tools that VRChat Inc. doesn't really bother about, especially VRCX, a friend management app that uses unofficial API to obtain information from VRChat servers, which includes age verified badges

Assistant

I think **VRChat’s \`Verified 18+\` status is one of the strongest age signals available inside the VRChat ecosystem**, but I would treat it as a **delegated age-assurance credential**, not as universally sufficient legal age verification.

There are three separate questions here: **is VRChat’s result trustworthy, can you safely obtain it, and can you prove that the person using your downstream app owns that VRChat account?**

On the first question, I’m fairly comfortable. VRChat’s own system is backed by Persona and explicitly says that only users verified as 18+ can display the Verified 18+ marker and access age-restricted instances. Importantly, the generic ageVerified state is **not enough** because minors can also have their age verified; you specifically need the 18+ result.

Source: https://wiki.vrchat.com/wiki/Special%3AMyLanguage/Age_verification

So conceptually:

VRChat Verified 18+  
↓  
reasonable assertion:  
"VRChat has age-assured this account as \>= 18"

I would be willing to let a downstream application treat that as something like:

assurance_provider = "vrchat"  
assurance_claim = "age \>= 18"  
assurance_level = "third_party_verified"

rather than storing date of birth or real identity.

That is actually a privacy-positive design.

**The weird API situation**

Your description of VRCX is mostly right, but VRChat's current policy is slightly more permissive than “they don't bother enforcing it.”

Their Creator Guidelines explicitly say developers **may interact with the VRChat API and write applications against it**, even though the API is undocumented, unsupported, and may change without warning. They even point developers toward the community-maintained unofficial API documentation.

Source: https://hello.vrchat.com/creator-guidelines

That's basically the ecosystem VRCX lives in.

But there's an awkward legal/policy wrinkle: VRChat's Terms of Service also broadly prohibit automated tools, crawlers, scrapers and other mechanisms from extracting data from the Platform.

Source: https://hello.vrchat.com/legal

So there is a genuine tension:

Creator Guidelines:  
"You may interact with our API if you follow these rules."  
  
versus  
  
Terms:  
"Don't use automated mechanisms to extract Platform data."

I would therefore distinguish **an API client performing a narrow user-requested lookup** from **a crawler continuously harvesting VRChat profiles**.

The first is much closer to what VRChat explicitly says developers can do. The second is much harder to defend.

For your project, I'd stay firmly in the first category.

## The bigger problem isn't actually the badge

It's **account ownership**.

Suppose I tell your website:

My VRChat user ID is:  
usr_some_verified_adult

Your application queries VRChat and discovers:

Verified 18+ = yes

Great. Except that account might belong to someone else.

You've proven that VRChat account belongs to an adult, but not that this website user controls that VRChat account.

That's the missing link.

And unfortunately VRChat explicitly says it currently doesn't offer OAuth, while also telling applications **not to request or store VRChat usernames/passwords, auth tokens, or session data.**

Source: https://hello.vrchat.com/creator-guidelines

So I absolutely would **not** implement "Log in with your VRChat username/password", even if VRCX can locally authenticate users. A centralized web application holding those credentials is a completely different risk profile.

# Interestingly, your earlier ownership-challenge system fits here perfectly

You could theoretically do something like:

Downstream app  
│  
│ generate random nonce  
↓  
"Place this temporarily in  
your VRChat public profile:  
  
crawler-verify:K8F2XQ91"  
│  
↓  
User edits profile through VRChat  
│  
↓  
Application checks public profile  
  
Verified nonce? ─────── yes  
Verified 18+? ───────── yes  
│  
↓  
AGE_ASSURED

That proves two things independently:

CONTROL  
User demonstrated control over usr_xxxxx  
  
AGE  
VRChat says usr_xxxxx is Verified 18+

Then throw away the nonce.

You never learn DOB, legal name, ID number, passport, face, or Persona information.

That's extremely attractive architecturally.

**But I would not standardize this yet**, because automatically reading that VRChat profile still depends upon VRChat's unsupported API and its current policy environment.

It would be a neat optional downstream integration rather than a crawler-network requirement.

# There's also an even cleaner version

Suppose eventually VRChat introduces actual OAuth or another delegated-login system.

Then this becomes almost perfect:

User  
↓  
VRChat OAuth  
↓  
Downstream app receives:  
  
subject = usr_xxxxx  
age_assured_18_plus = true  
↓  
Access granted

Now VRChat becomes an actual identity provider / age-assertion provider.

That's considerably stronger than scraping a profile badge.

Your architecture should probably be designed so that this can replace the current hack without changing everything.

For example:

interface AgeClaim {  
issuer: string;  
subject: string;  
threshold: number;  
assurance: "self" \| "estimated" \| "verified";  
issuedAt?: number;  
expiresAt?: number;  
}

Then today issuer = vrchat-unofficial-profile might exist. Later issuer = vrchat-oauth could replace it. Other apps could use Discord, Persona, or another provider without changing your crawler.

## I wouldn't have the crawler perform the VRChat lookup

This part I feel fairly strongly about.

Don't make the central crawler do:

GET VRChat user  
↓  
store user's age verification state

for everyone.

Let the downstream application do it **when the user asks to unlock restricted functionality**.

Then the crawler receives something abstract like:

consumer X asserts:  
session Y has satisfied AGE_18

That keeps VRChat user profiles completely outside your package database.

It also massively reduces the possibility that someone describes the crawler as a database correlating VRChat identities with age information.

Because in the Philippines, **age is explicitly classified as sensitive personal information** under the Data Privacy Act.

Source: https://privacy.gov.ph/data-privacy-act-/

Even though the user may voluntarily display a public Verified 18+ badge, systematically collecting and associating that status with identities introduces a much more serious privacy role than simply checking a condition transiently.

So preferably:

VRChat profile  
↓  
transient verification  
↓  
true / false  
↓  
discard profile response

rather than building a crawler user table of VRChat IDs and age status.

# There's one subtle detail I'd be extremely careful about

The community API exposes both things resembling ageVerified and ageVerificationStatus.

The community-generated API documentation explicitly warns that ageVerified == true means the person has undergone age verification, **not necessarily that they're 18+.**

Source: https://github.com/vrchatapi/vrchatapi-dart/blob/main/vrchat_dart_generated/doc/LimitedUserInstance.md

So this would be dangerous:

if (user.ageVerified) {  
allowPorn();  
}

You need the equivalent of Verified 18+, not merely Age Verified, because a minor can theoretically be age-verified while still under 18.

# What about the public badge being hidden?

Another weird case.

VRChat users can hide their Verified 18+ profile marker while **still remaining age verified and still being eligible for 18+ instances**.

Source: https://wiki.vrchat.com/wiki/Special%3AMyLanguage/Age_verification

Therefore:

badge visible  
↓  
can be evidence of 18+  
  
badge absent  
↓  
means UNKNOWN

It does **not** mean under 18 or not verified.

That's important both technically and socially.

# So I would give VRChat assurance this status

\| Method \| My confidence \|

\|---\|---\|

\| User clicks “I am 18+” \| Weak \|

\| Account/activity age inference \| Moderate depending on implementation \|

\| Visible VRChat \`Verified 18+\` with no account-control proof \| Strong age signal, weak identity binding \|

\| VRChat \`Verified 18+\` + proof user controls profile \| \*\*Strong\*\* \|

\| Official VRChat OAuth + 18+ claim \| \*\*Ideal\*\*, if it ever exists \|

\| Downstream app collects person's government ID itself \| Avoid \|

\| Downstream app stores Persona/ID details \| Definitely avoid \|

So if you asked me:

> **Would I allow a downstream crawler app to use VRChat's Verified 18+ status as its age-assurance mechanism?**

**Yes.**

I would permit it in your downstream specification.

But I'd word the policy approximately as:

> A downstream consumer may rely upon an age-assurance assertion issued by a third-party platform or provider, including an assertion that an account has been verified as meeting the applicable age threshold, where the consumer has reasonable grounds to trust both the assertion and its binding to the requesting user.

Notice that doesn't say "VRChat is legally approved by the crawler."

It merely allows downstream apps to make that trust decision.

And I'd add one very important network rule:

AGE_ASSURED_BY_VRCHAT

should never travel upstream as:

REAL_IDENTITY_VERIFIED

Those are **not equivalent**.

All the crawler needs to know is:

AGE_18_REQUIREMENT_SATISFIED

The proof and provider can stay downstream.

That preserves the separation:

VRChat / Persona  
│  
│ age assertion  
▼  
Downstream Application  
│  
│ access capability  
▼  
Crawler restricted API

VRChat never needs to know about your crawler, and the crawler never needs to know the person's VRChat identity.

**我的看法：VRChat 的“Verified 18+”可以作为很强的年龄证明信号，但不应该成为整个系统唯一的信任来源。**

\*Wǒ de kànfǎ: VRChat de “Verified 18+” kěyǐ zuòwéi hěn qiáng de niánlíng zhèngmíng xìnhào, dàn bù yīnggāi chéngwéi zhěnggè xìtǒng wéiyī de xìnrèn láiyuán.\*

My view: VRChat's Verified 18+ can be a strong age-assurance signal, but it shouldn't be the system's only source of trust.

**最好只证明“这个用户满足十八岁以上的要求”，而不要保存他的真实身份。**

\*Zuì hǎo zhǐ zhèngmíng “zhège yònghù mǎnzú shíbā suì yǐshàng de yāoqiú”, ér bú yào bǎocún tā de zhēnshí shēnfèn.\*

Ideally, prove only that the user satisfies the 18+ requirement, without storing their real identity.

User

can you export this entire conversation into a document
