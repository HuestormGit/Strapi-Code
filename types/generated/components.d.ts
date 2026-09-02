import type { Schema, Struct } from '@strapi/strapi';

export interface OrderShippingSnapshot extends Struct.ComponentSchema {
  collectionName: 'components_order_shipping_snapshots';
  info: {
    description: 'Immutable copy of the delivery address exactly as entered at checkout. Deliberately NOT a relation to any Address record, so a customer editing or deleting a saved address can never rewrite order history.';
    displayName: 'Shipping Snapshot';
    icon: 'pinMap';
  };
  attributes: {
    addressLine1: Schema.Attribute.String;
    addressLine2: Schema.Attribute.String;
    capturedAt: Schema.Attribute.DateTime;
    city: Schema.Attribute.String;
    country: Schema.Attribute.String & Schema.Attribute.DefaultTo<'India'>;
    email: Schema.Attribute.Email;
    fullName: Schema.Attribute.String;
    landmark: Schema.Attribute.String;
    phone: Schema.Attribute.String;
    postalCode: Schema.Attribute.String;
    sourceAddressRef: Schema.Attribute.String;
    state: Schema.Attribute.String;
    stateCode: Schema.Attribute.String;
  };
}

export interface SharedDimensions extends Struct.ComponentSchema {
  collectionName: 'components_shared_dimensions';
  info: {
    description: 'Physical package dimensions, used for shipping rate calculation and courier manifests.';
    displayName: 'Dimensions';
    icon: 'expand';
  };
  attributes: {
    height: Schema.Attribute.Decimal;
    length: Schema.Attribute.Decimal;
    unit: Schema.Attribute.Enumeration<['cm', 'mm', 'in']> &
      Schema.Attribute.DefaultTo<'cm'>;
    width: Schema.Attribute.Decimal;
  };
}

export interface SharedMedia extends Struct.ComponentSchema {
  collectionName: 'components_shared_media';
  info: {
    displayName: 'Media';
    icon: 'file-video';
  };
  attributes: {
    file: Schema.Attribute.Media<'images' | 'files' | 'videos'>;
  };
}

export interface SharedQuote extends Struct.ComponentSchema {
  collectionName: 'components_shared_quotes';
  info: {
    displayName: 'Quote';
    icon: 'indent';
  };
  attributes: {
    body: Schema.Attribute.Text;
    title: Schema.Attribute.String;
  };
}

export interface SharedRichText extends Struct.ComponentSchema {
  collectionName: 'components_shared_rich_texts';
  info: {
    description: '';
    displayName: 'Rich text';
    icon: 'align-justify';
  };
  attributes: {
    body: Schema.Attribute.RichText;
  };
}

export interface SharedSeo extends Struct.ComponentSchema {
  collectionName: 'components_shared_seos';
  info: {
    description: '';
    displayName: 'Seo';
    icon: 'allergies';
    name: 'Seo';
  };
  attributes: {
    metaDescription: Schema.Attribute.Text & Schema.Attribute.Required;
    metaTitle: Schema.Attribute.String & Schema.Attribute.Required;
    shareImage: Schema.Attribute.Media<'images'>;
  };
}

export interface SharedSlider extends Struct.ComponentSchema {
  collectionName: 'components_shared_sliders';
  info: {
    description: '';
    displayName: 'Slider';
    icon: 'address-book';
  };
  attributes: {
    files: Schema.Attribute.Media<'images', true>;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'order.shipping-snapshot': OrderShippingSnapshot;
      'shared.dimensions': SharedDimensions;
      'shared.media': SharedMedia;
      'shared.quote': SharedQuote;
      'shared.rich-text': SharedRichText;
      'shared.seo': SharedSeo;
      'shared.slider': SharedSlider;
    }
  }
}
